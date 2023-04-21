import { BigInt, ethereum, log } from '@graphprotocol/graph-ts'
import {
  Approval,
  BeaconValidatorsUpdated,
  ETHDistributed,
  FeeDistributionSet,
  FeeSet,
  Lido,
  Resumed,
  SharesBurnt,
  Stopped,
  Submitted,
  TokenRebased,
  Transfer,
  TransferShares
} from '../generated/Lido/Lido'
import {
  LidoSubmission,
  Holder,
  LidoFee,
  CurrentFees,
  LidoFeeDistribution,
  TotalReward,
  NodeOperatorsShares,
  NodeOperatorFees,
  LidoStopped,
  LidoResumed,
  LidoApproval,
  Total,
  SharesBurn
} from '../generated/schema'

import { ZERO, getAddress, ONE, CALCULATION_UNIT, ZERO_ADDRESS } from './constants'
import {
  parseEventLogs,
  extractPairedEvent,
  getParsedEventByName,
  getRightPairedEventByLeftLogIndex,
  getParsedEvent
} from './parser'
import {
  _calcAPR_v2,
  _loadOrCreateLidoTransferEntity,
  _loadOrCreateSharesEntity,
  _loadOrCreateStatsEntity,
  _loadOrCreateTotalRewardEntity,
  // _loadOrCreateTotalRewardEntity,
  _loadOrCreateTotalsEntity,
  _updateHolders,
  _updateTransferBalances,
  _updateTransferShares,
  isLidoTransferShares,
  isLidoV2
} from './helpers'

export function handleSubmitted(event: Submitted): void {
  let entity = new LidoSubmission(event.transaction.hash.toHex() + '-' + event.logIndex.toString())

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.transactionIndex = event.transaction.index
  entity.logIndex = event.logIndex
  entity.sender = event.params.sender
  entity.amount = event.params.amount
  entity.referral = event.params.referral

  // Loading totals
  const totals = _loadOrCreateTotalsEntity()

  /**
   Use 1:1 ether-shares ratio when:
   1. Nothing was staked yet
   2. Someone staked something, but shares got rounded to 0 eg staking 1 wei
  **/

  // Check if contract has no ether or shares yet
  let shares = totals.totalPooledEther.isZero()
    ? event.params.amount
    : event.params.amount.times(totals.totalShares).div(totals.totalPooledEther)

  // Someone staked > 0 wei, but shares to mint got rounded to 0
  if (shares.equals(ZERO)) {
    shares = event.params.amount
  }
  entity.shares = shares

  if (isLidoTransferShares()) {
    const parsedEvents = parseEventLogs(event, event.address, event.logIndex, event.logIndex.plus(BigInt.fromI32(2)))
    // extracting only 'Transfer' and 'TransferShares' pairs
    const transferEventPairs = extractPairedEvent(
      parsedEvents,
      'Transfer',
      'TransferShares',
      event.logIndex // start from event itself and to the end of tx receipt
    )

    // expecting at least one Transfer events pair
    assert(transferEventPairs.length > 0, 'Not found events pair Transfer/TransferShares')

    // take only 1st
    // const eventTransfer = getParsedEvent<Transfer>(transferEventPairs[0], 0)
    const eventTransferShares = getParsedEvent<TransferShares>(transferEventPairs[0], 1)
    if (eventTransferShares.params.sharesValue != shares) {
      log.critical(
        'Unexpected shares in TransferShares event! calc shares: {} event shares: {} totalShares: {} totalPooledEth: {} block: {} txHash: {} logIdx(Transfer): {} logIdx(TransferShares): {}',
        [
          shares.toString(),
          eventTransferShares.params.sharesValue.toString(),
          totals.totalShares.toString(),
          totals.totalPooledEther.toString(),
          event.block.number.toString(),
          event.transaction.hash.toHexString(),
          event.logIndex.toString(),
          eventTransferShares.logIndex.toString()
        ]
      )
    }
  }

  const sharesEntity = _loadOrCreateSharesEntity(event.params.sender)

  entity.sharesBefore = sharesEntity.shares
  entity.sharesAfter = entity.sharesBefore.plus(shares)

  entity.totalPooledEtherBefore = totals.totalPooledEther
  entity.totalSharesBefore = totals.totalShares

  // Increasing Total
  totals.totalPooledEther = totals.totalPooledEther.plus(event.params.amount)
  totals.totalShares = totals.totalShares.plus(shares)
  totals.save()

  entity.totalPooledEtherAfter = totals.totalPooledEther
  entity.totalSharesAfter = totals.totalShares

  // Calculating new balance
  entity.balanceAfter = entity.sharesAfter.times(totals.totalPooledEther).div(totals.totalShares)
  entity.save()
}

export function handleTransfer(event: Transfer): void {
  const entity = _loadOrCreateLidoTransferEntity(event)

  // Entity is already created at this point
  const totals = _loadOrCreateTotalsEntity()
  assert(!totals.totalPooledEther.isZero(), 'Transfer at zero totalPooledEther')

  entity.totalPooledEther = totals.totalPooledEther
  entity.totalShares = totals.totalShares

  let eventTransferShares: TransferShares | null = null
  // now we should parse the whole tx receipt to be sure pair extraction is accurate
  if (isLidoTransferShares()) {
    const parsedEvents = parseEventLogs(event, event.address)
    eventTransferShares = getRightPairedEventByLeftLogIndex<TransferShares>(
      extractPairedEvent(parsedEvents, 'Transfer', 'TransferShares'),
      event.logIndex
    )
    // TransferShares should exists after according upgrade
    if (!eventTransferShares) {
      log.critical('Paired TRansferShares event not found! block: {} txHash: {} logIdx: {}', [
        event.block.number.toString(),
        event.transaction.hash.toHexString(),
        event.logIndex.toString()
      ])
      return
    }
    // eventTransferShares = transferEventPair[1]
    entity.shares = eventTransferShares.params.sharesValue

    // skip handling if nothing to handle
    if (entity.value.isZero() && entity.shares.isZero()) {
      return
    }
  } else {
    // usual transfer without TransferShares event, so calc shares
    entity.shares = entity.value.times(totals.totalShares).div(totals.totalPooledEther)
  }

  if (entity.from == ZERO_ADDRESS) {
    // process mint transfers

    const isV2 = isLidoV2()
    // check if totalReward record exists, so assuming it's mint during Oracle report
    const totalRewardsEntity = TotalReward.load(event.transaction.hash)
    if (totalRewardsEntity) {
      /// @deprecated
      entity.mintWithoutSubmission = true

      // if (isLidoV2()) {
      //   // after V2 upgrade, TotalReward is handled by handleETHDistributed
      // } else {
      /**
       * Handling fees during oracle report, in order:
       * 1. Insurance Fund Transfer
       * 2. Node Operator Reward Transfers
       * 3. Treasury Fund Transfer with remaining dust or just rounding dust
       **/

      // in case TreasureAddress = InsuranceAddress and insuranceFeeBasisPoints no zero assuming the first tx should go to Insurance
      if (
        !isV2 &&
        entity.to == getAddress('INSURANCE_FUND') &&
        !totalRewardsEntity.insuranceFeeBasisPoints.isZero() &&
        totalRewardsEntity.insuranceFee.isZero()
      ) {
        // Handling the Insurance Fee transfer event
        totalRewardsEntity.insuranceFee = totalRewardsEntity.insuranceFee.plus(entity.value)

        // sanity assertion
        if (eventTransferShares) {
          // assert(entity.shares == totalRewardsEntity.sharesToInsuranceFund, 'Unexpected sharesToInsuranceFund')
          if (entity.shares != totalRewardsEntity.sharesToInsuranceFund) {
            log.critical(
              'Unexpected sharesToInsuranceFund! shares: {} entity share: {} event shares: {} totalShares: {} totalPooledEth: {} block: {} txHash: {} logIdx(Transfer): {} logIdx(TransferShares): {}',
              [
                totalRewardsEntity.sharesToInsuranceFund.toString(),
                entity.shares.toString(),
                eventTransferShares.params.sharesValue.toString(),
                totals.totalShares.toString(),
                totals.totalPooledEther.toString(),
                event.block.number.toString(),
                event.transaction.hash.toHexString(),
                event.logIndex.toString(),
                eventTransferShares.logIndex.toString()
              ]
            )
          }
        } else {
          // overriding calculated value
          entity.shares = totalRewardsEntity.sharesToInsuranceFund
        }

        assert(totalRewardsEntity.totalRewards >= entity.value, 'Total rewards < Insurance fee')
      } else if (entity.to == getAddress('TREASURE')) {
        // Handling the Treasury Fund transfer event

        if (isV2) {
          // just updating counter as they zeros by default
          totalRewardsEntity.treasuryFee = totalRewardsEntity.treasuryFee.plus(entity.value)
          totalRewardsEntity.sharesToTreasury
        } else {
          let shares: BigInt
          // Dust exists only when treasuryFeeBasisPoints is 0 and prior Lido v2
          if (totalRewardsEntity.treasuryFeeBasisPoints.isZero()) {
            totalRewardsEntity.dust = totalRewardsEntity.dust.plus(entity.value)
            shares = totalRewardsEntity.dustSharesToTreasury
          } else {
            totalRewardsEntity.treasuryFee = totalRewardsEntity.treasuryFee.plus(entity.value)
            shares = totalRewardsEntity.sharesToTreasury
          }

          if (eventTransferShares) {
            // assert(entity.shares == shares, 'Unexpected sharesToTreasury')
            if (entity.shares != shares) {
              log.critical(
                'Unexpected sharesToTreasury! shares: {} entity share: {} event shares: {} totalShares: {} totalPooledEth: {} block: {} txHash: {} logIdx(Transfer): {} logIdx(TransferShares): {}',
                [
                  shares.toString(),
                  entity.shares.toString(),
                  eventTransferShares.params.sharesValue.toString(),
                  totals.totalShares.toString(),
                  totals.totalPooledEther.toString(),
                  event.block.number.toString(),
                  event.transaction.hash.toHexString(),
                  event.logIndex.toString(),
                  eventTransferShares.logIndex.toString()
                ]
              )
            }
          } else {
            // overriding calculated value
            entity.shares = shares
          }
        }

        assert(totalRewardsEntity.totalRewards >= entity.value, 'Total rewards < Treasure fee')
      } else {
        //
        if (!isV2) {
          // Handling fee transfer to node operator only prior v2 upgrade
          // After v2 there are only transfer to SR modules
          const nodeOperatorFees = new NodeOperatorFees(
            event.transaction.hash.toHex() + '-' + event.logIndex.toString()
          )
          // Reference to TotalReward entity
          nodeOperatorFees.totalReward = totalRewardsEntity.id
          nodeOperatorFees.address = entity.to
          nodeOperatorFees.fee = entity.value
          nodeOperatorFees.save()

          // Entity should exists at this point
          const nodeOperatorsShares = NodeOperatorsShares.load(
            event.transaction.hash.toHex() + '-' + entity.to.toHexString()
          )

          // assert(entity.shares == nodeOperatorsShares!.shares, 'Unexpected nodeOperatorsShares')
          if (eventTransferShares) {
            if (entity.shares != nodeOperatorsShares!.shares) {
              log.critical(
                'Unexpected nodeOperatorsShares! shares: {} tx share: {}  event shares: {} totalShares: {} totalPooledEth: {} block: {} txHash: {} logIdx(Transfer): {} logIdx(TransferShares): {}',
                [
                  nodeOperatorsShares!.shares.toString(),
                  entity.shares.toString(),
                  eventTransferShares.params.sharesValue.toString(),
                  totals.totalShares.toString(),
                  totals.totalPooledEther.toString(),
                  event.block.number.toString(),
                  event.transaction.hash.toHexString(),
                  event.logIndex.toString(),
                  eventTransferShares.logIndex.toString()
                ]
              )
            }
          } else {
            entity.shares = nodeOperatorsShares!.shares
          }
        }
        // but in both cases summarizing operator's rewards
        totalRewardsEntity.operatorsFee = totalRewardsEntity.operatorsFee.plus(entity.value)
        assert(totalRewardsEntity.totalRewards >= totalRewardsEntity.operatorsFee, 'Total rewards < NO fee')
      }

      // decreasing saved total rewards to (remainder will be users reward)
      totalRewardsEntity.totalRewards = totalRewardsEntity.totalRewards.minus(entity.value)
      // increasing total system fee value
      totalRewardsEntity.totalFee = totalRewardsEntity.totalFee.plus(entity.value)
      totalRewardsEntity.save()
      // }
    } else {
      // transfer after submit
      /// @deprecated
      entity.mintWithoutSubmission = false

      if (!eventTransferShares) {
        // prior TransferShares logic
        // try get shares from Submission entity from the previous logIndex (as mint Transfer occurs only after Submit event)
        let submissionEntity = LidoSubmission.load(
          event.transaction.hash.toHex() + '-' + event.logIndex.minus(ONE).toString()
        )
        // throws error if no submissionEntity
        entity.shares = submissionEntity!.shares

        // assert(entity.shares == submissionEntity!.shares, 'unexpected Submission/Transfer shares')
        // if (entity.shares != submissionEntity!.shares) {
        //   log.critical(
        //     'Unexpected submissionEntity shares! shares: {} tx share: {} totalShares: {} totalPooledEth: {} block: {} txHash: {} logIdx(Transfer): {} ',
        //     [
        //       submissionEntity!.shares.toString(),
        //       entity.shares.toString(),
        //       totals.totalShares.toString(),
        //       totals.totalPooledEther.toString(),
        //       event.block.number.toString(),
        //       event.transaction.hash.toHexString(),
        //       event.logIndex.toString()
        //     ]
        //   )
        // }
      }
    }
  }

  // upd account's shares and stats
  _updateTransferShares(entity)
  _updateTransferBalances(entity)
  _updateHolders(entity)
  entity.save()
}

export function handleSharesBurnt(event: SharesBurnt): void {
  // shares are burned only during oracle report from LidoBurner contract
  let entity = SharesBurn.load(event.transaction.hash.toHex() + '-' + event.logIndex.toString())
  // process totals only if entity not exists before, i.e. not handled by other handlers
  if (!!entity) {
    return
  }

  entity = new SharesBurn(event.transaction.hash.toHex() + '-' + event.logIndex.toString())
  entity.account = event.params.account
  entity.postRebaseTokenAmount = event.params.postRebaseTokenAmount
  entity.preRebaseTokenAmount = event.params.preRebaseTokenAmount
  entity.sharesAmount = event.params.sharesAmount
  entity.save()

  // if (event.params.account != ZERO_ADDRESS) {
  const shares = _loadOrCreateSharesEntity(event.params.account)
  shares.shares = shares.shares.minus(event.params.sharesAmount)
  shares.save()

  const totals = _loadOrCreateTotalsEntity()
  totals.totalShares = totals.totalShares.minus(event.params.sharesAmount)
  totals.save()

  const balanceAfterDecrease = shares.shares.times(totals.totalPooledEther).div(totals.totalShares)

  const holder = Holder.load(event.params.account)
  if (holder) {
    if (holder.hasBalance && balanceAfterDecrease.isZero()) {
      holder.hasBalance = false
      const stats = _loadOrCreateStatsEntity()
      stats.uniqueHolders = stats.uniqueHolders.minus(ONE)
      stats.save()
    }
    holder.save()
  } // else should not to be
  // }
}

// only for Lido v2

// event WithdrawalsFinalized (or WithdrawalsBatchFinalized) should be captured by Subgraph right before
// and totalPooledEther will be decreased by amountETHToLock
export function handleETHDistributed(event: ETHDistributed): void {
  // we should process token rebase here as TokenRebased event fired last but we need new values before transfers
  // parse all events from tx receipt
  const parsedEvents = parseEventLogs(event, event.address)

  // TokenRebased event should exists
  const tokenRebasedEvent = getParsedEventByName<TokenRebased>(parsedEvents, 'TokenRebased', event.logIndex)
  if (!tokenRebasedEvent) {
    log.critical('Event TokenRebased not found when ETHDistributed! block: {} txHash: {} logIdx: {} ', [
      event.block.number.toString(),
      event.transaction.hash.toHexString(),
      event.logIndex.toString()
    ])
    return
  }
  const totals = _loadOrCreateTotalsEntity()
  const totalRewardsEntity = _loadOrCreateTotalRewardEntity(event)

  totalRewardsEntity.totalPooledEtherBefore = totals.totalPooledEther
  totalRewardsEntity.totalSharesBefore = totals.totalShares

  totals.totalPooledEther = totals.totalPooledEther
    .plus(event.params.withdrawalsWithdrawn)
    .plus(event.params.executionLayerRewardsWithdrawn)

  // totals.totalPooledEther = tokenRebasedEvent.params.postTotalEther
  // totals.totalShares = tokenRebasedEvent.params.postTotalShares
  totals.save()

  assert(
    totals.totalPooledEther == tokenRebasedEvent.params.postTotalEther,
    'Unexpected totalPooledEther on ETHDistributed'
  )

  // try to find and handle SharesBurnt event which expect not yet changed totalShares
  const sharesBurntEvent = getParsedEventByName<SharesBurnt>(
    parsedEvents,
    'SharesBurnt',
    event.logIndex,
    tokenRebasedEvent.logIndex
  )

  if (sharesBurntEvent) {
    log.warning('Event sharesBurntEvent when ETHDistributed! block: {} txHash: {} logIdx: {} ', [
      sharesBurntEvent.block.number.toString(),
      sharesBurntEvent.transaction.hash.toHexString(),
      sharesBurntEvent.logIndex.toString()
    ])
    handleSharesBurnt(sharesBurntEvent)
  }

  // save correct totalShares for next mint transfers (i.e. accounting minted rewards), as we need new values before transfers
  totals.totalShares = tokenRebasedEvent.params.postTotalShares
  totals.save()

  const postCLTotalBalance = event.params.postCLBalance.plus(event.params.withdrawalsWithdrawn)
  const totalRewards =
    postCLTotalBalance > event.params.preCLBalance
      ? postCLTotalBalance.minus(event.params.preCLBalance).plus(event.params.executionLayerRewardsWithdrawn)
      : ZERO

  totalRewardsEntity.totalRewards = totalRewards
  totalRewardsEntity.totalRewardsWithFees = totalRewardsEntity.totalRewards
  totalRewardsEntity.mevFee = event.params.executionLayerRewardsWithdrawn

  totalRewardsEntity.totalPooledEtherAfter = totals.totalPooledEther
  totalRewardsEntity.totalSharesAfter = totals.totalShares
  totalRewardsEntity.save()
}

export function handleTokenRebase(event: TokenRebased): void {
  // we should process token rebase here as TokenRebased event fired last

  // parse all events from tx receipt
  const parsedEvents = parseEventLogs(event, event.address)

  // find preceding ETHDistributed event
  const ethDistributedEvent = getParsedEventByName<ETHDistributed>(parsedEvents, 'ETHDistributed', ZERO, event.logIndex)
  if (!ethDistributedEvent) {
    log.critical('Event ETHDistributed not found when TokenRebased! block: {} txHash: {} logIdx: {} ', [
      event.block.number.toString(),
      event.transaction.hash.toHexString(),
      event.logIndex.toString()
    ])
    return
  }

  let totals = _loadOrCreateTotalsEntity()
  let totalRewardsEntity = _loadOrCreateTotalRewardEntity(event)
  //   totalRewardsEntity.totalPooledEtherBefore = totals.totalPooledEther
  //   totalRewardsEntity.totalSharesBefore = totals.totalShares

  //   totals.totalPooledEther = event.params.postTotalEther
  // totals.totalShares = event.params.postTotalShares
  // totals.save()

  //   totalRewardsEntity.totalPooledEtherAfter = totals.totalPooledEther
  //   totalRewardsEntity.totalSharesAfter = totals.totalShares

  // totalRewardsEntity.totalRewardsWithFees = totalRewardsEntity.totalPooledEtherAfter.minus(
  //   totalRewardsEntity.totalPooledEtherBefore
  // )

  totalRewardsEntity.shares2mint = event.params.sharesMintedAsFees

  // extracting only 'Transfer' and 'TransferShares' pairs between ETHDistributed to TokenRebased
  // assuming the ETHDistributed and TokenRebased events are presents in tx only once
  const transferEventPairs = extractPairedEvent(
    parsedEvents,
    'Transfer',
    'TransferShares',
    ethDistributedEvent.logIndex, // start from ETHDistributed event itself
    event.logIndex // and to the TokenRebased event
  )

  let sharesToTreasury = ZERO
  let sharesToOperators = ZERO
  let treasuryFee = ZERO
  let operatorsFee = ZERO

  // NB: there is no insurance fund anymore since v2
  for (let i = 0; i < transferEventPairs.length; i++) {
    const eventTransfer = getParsedEvent<Transfer>(transferEventPairs[i], 0)
    const eventTransferShares = getParsedEvent<TransferShares>(transferEventPairs[i], 1)

    const treasureAddress = getAddress('TREASURE')
    log.warning('treasureAddress {}', [treasureAddress.toHexString()])
    // process only mint events
    if (eventTransfer.params.from == ZERO_ADDRESS) {
      log.warning('eventTransfer.params.to {}', [eventTransfer.params.to.toHexString()])
      if (eventTransfer.params.to == treasureAddress) {
        sharesToTreasury = sharesToTreasury.plus(eventTransferShares.params.sharesValue)
        treasuryFee = treasuryFee.plus(eventTransfer.params.value)
        log.warning('sharesToTreasury": transfer  {} total {} totalFee {}', [
          eventTransferShares.params.sharesValue.toString(),
          sharesToTreasury.toString(),
          treasuryFee.toString()
        ])
      } else {
        sharesToOperators = sharesToOperators.plus(eventTransferShares.params.sharesValue)
        operatorsFee = operatorsFee.plus(eventTransfer.params.value)

        log.warning('operatorsFee: transfer {} total {} totalFee {}', [
          eventTransferShares.params.sharesValue.toString(),
          sharesToOperators.toString(),
          operatorsFee.toString()
        ])
      }
    }
  }

  // totalRewardsEntity.sharesToTreasury = sharesToTreasury
  // totalRewardsEntity.treasuryFee = treasuryFee
  // totalRewardsEntity.sharesToOperators = sharesToOperators
  // totalRewardsEntity.operatorsFee = operatorsFee
  // totalRewardsEntity.totalFee = treasuryFee.plus(operatorsFee)
  // totalRewardsEntity.totalRewards = totalRewardsEntity.totalRewardsWithFees.minus(totalRewardsEntity.totalFee)
  if (totalRewardsEntity.sharesToTreasury != sharesToTreasury) {
    log.warning('totalRewardsEntity.sharesToTreasury != sharesToTreasury: {} != {}', [
      totalRewardsEntity.sharesToTreasury.toString(),
      sharesToTreasury.toString()
    ])
  }
  if (totalRewardsEntity.sharesToOperators != sharesToOperators) {
    log.warning('totalRewardsEntity.sharesToOperators != sharesToOperators: {} != {}', [
      totalRewardsEntity.sharesToOperators.toString(),
      sharesToOperators.toString()
    ])
  }

  if (totalRewardsEntity.shares2mint != sharesToTreasury.plus(sharesToOperators)) {
    log.critical(
      'totalRewardsEntity.shares2mint != sharesToTreasury + sharesToOperators: shares2mint {} sharesToTreasury {} sharesToOperators {}',
      [totalRewardsEntity.shares2mint.toString(), sharesToTreasury.toString(), sharesToOperators.toString()]
    )
  }

  // assert(sharesToTreasury == totalRewardsEntity.shares2mint.minus(sharesToOperators), "fee shares summ doesn't match")

  //   totalRewardsEntity.mevFee = event.params.executionLayerRewardsWithdrawn

  // @todo calc
  // totalRewardsEntity.feeBasis = currentFees.feeBasisPoints!
  // totalRewardsEntity.treasuryFeeBasisPoints =
  //   currentFees.treasuryFeeBasisPoints!
  // totalRewardsEntity.insuranceFeeBasisPoints =
  //   currentFees.insuranceFeeBasisPoints!
  // totalRewardsEntity.operatorsFeeBasisPoints =
  //   currentFees.operatorsFeeBasisPoints!

  // APR
  totalRewardsEntity.timeElapsed = event.params.timeElapsed

  _calcAPR_v2(
    totalRewardsEntity,
    event.params.preTotalEther,
    event.params.postTotalEther,
    event.params.preTotalShares,
    event.params.postTotalShares,
    event.params.timeElapsed
  )

  totalRewardsEntity.save()
}

export function handleFeeSet(event: FeeSet): void {
  const entity = new LidoFee(event.transaction.hash.toHex() + '-' + event.logIndex.toString())
  entity.feeBasisPoints = event.params.feeBasisPoints
  entity.save()

  let current = CurrentFees.load('')
  if (!current) {
    current = new CurrentFees('')
    current.treasuryFeeBasisPoints = ZERO
    current.insuranceFeeBasisPoints = ZERO
    current.operatorsFeeBasisPoints = ZERO
  }

  current.feeBasisPoints = BigInt.fromI32(event.params.feeBasisPoints)
  current.save()
}

export function handleFeeDistributionSet(event: FeeDistributionSet): void {
  const entity = new LidoFeeDistribution(event.transaction.hash.toHex() + '-' + event.logIndex.toString())
  entity.treasuryFeeBasisPoints = event.params.treasuryFeeBasisPoints
  entity.insuranceFeeBasisPoints = event.params.insuranceFeeBasisPoints
  entity.operatorsFeeBasisPoints = event.params.operatorsFeeBasisPoints
  entity.save()

  let current = CurrentFees.load('')
  if (!current) {
    current = new CurrentFees('')
    current.feeBasisPoints = ZERO
  }

  current.treasuryFeeBasisPoints = BigInt.fromI32(event.params.treasuryFeeBasisPoints)
  current.insuranceFeeBasisPoints = BigInt.fromI32(event.params.insuranceFeeBasisPoints)
  current.operatorsFeeBasisPoints = BigInt.fromI32(event.params.operatorsFeeBasisPoints)
  current.save()
}

// @todo merge into LidoProtocolState
export function handleStopped(event: Stopped): void {
  let entity = new LidoStopped(event.transaction.hash.toHex() + '-' + event.logIndex.toString())
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.save()
}

// @todo merge into LidoProtocolState
export function handleResumed(event: Resumed): void {
  let entity = new LidoResumed(event.transaction.hash.toHex() + '-' + event.logIndex.toString())
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.save()
}

export function handleApproval(event: Approval): void {
  let entity = new LidoApproval(event.transaction.hash.toHex() + '-' + event.logIndex.toString())
  entity.owner = event.params.owner
  entity.spender = event.params.spender
  entity.value = event.params.value
  entity.save()
}

/**
 *  WARNING: this handler should exists for Goerli testnet, otherwise subgraph will break
 */

// Handling manual NOs removal on Testnet in txs:
// 6014681 0x45b83117a28ba9f6aed3a865004e85aea1e8611998eaef52ca81d47ac43e98d5
// 6014696 0x5d37899cce4086d7cdf8590f90761e49cd5dcc5c32aebbf2d9a6b2a1c00152c7

// Broken Oracle report after long broken state:
// First val number went down, but then went up all when reports were not happening.
// 7225143 0xde2667f834746bdbe0872163d632ce79c4930a82ec7c3c11cb015373b691643b

export function handleTestnetBlock(block: ethereum.Block): void {
  if (
    block.number.toString() == '6014681' ||
    block.number.toString() == '6014696' ||
    block.number.toString() == '7225143'
    // 7225313
  ) {
    _fixTotalPooledEther()
  }
}

// Handling validators count correction during the upgrade:
// 7127807 0xa9111b9bf19777ca08902fbd9c1dc8efc7a5bf61766f92bd469b522477257195
export function handleBeaconValidatorsUpdated(_event: BeaconValidatorsUpdated): void {
  _fixTotalPooledEther()
}

function _fixTotalPooledEther(): void {
  const realPooledEther = Lido.bind(getAddress('LIDO')).getTotalPooledEther()
  const totals = _loadOrCreateTotalsEntity()
  totals.totalPooledEther = realPooledEther
  totals.save()
}
