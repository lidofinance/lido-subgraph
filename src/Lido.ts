import { BigInt, ethereum, log, store } from '@graphprotocol/graph-ts'
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
  TransferShares,
  StakingLimitRemoved,
  StakingLimitSet,
  ELRewardsVaultSet,
  ELRewardsWithdrawalLimitSet,
  ProtocolContactsSet,
  StakingResumed,
  StakingPaused,
  WithdrawalCredentialsSet,
  LidoLocatorSet
} from '../generated/Lido/Lido'
import {
  LidoSubmission,
  Holder,
  CurrentFee,
  TotalReward,
  NodeOperatorsShares,
  NodeOperatorFees,
  LidoApproval,
  Total,
  SharesBurn,
  LidoConfig,
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
  _loadOrCreateTotalsEntity,
  _updateHolders,
  _updateTransferBalances,
  _updateTransferShares,
  isLidoTransferShares,
  isLidoV2
} from './helpers'

import { wcKeyCrops } from './wcKeyCrops'

export function handleSubmitted(event: Submitted): void {
  let entity = new LidoSubmission(event.transaction.hash.concatI32(event.logIndex.toI32()))

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
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
          const nodeOperatorFees = new NodeOperatorFees(event.transaction.hash.concatI32(event.logIndex.toI32()))
          // Reference to TotalReward entity
          nodeOperatorFees.totalReward = totalRewardsEntity.id
          nodeOperatorFees.address = entity.to
          nodeOperatorFees.fee = entity.value
          nodeOperatorFees.save()

          // Entity should exists at this point
          const nodeOperatorsShares = NodeOperatorsShares.load(event.transaction.hash.concat(entity.to))

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
        let submissionEntity = LidoSubmission.load(event.transaction.hash.concatI32(event.logIndex.minus(ONE).toI32()))
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
  const id = event.transaction.hash.concatI32(event.logIndex.toI32())
  let entity = SharesBurn.load(id)
  // process totals only if entity not yet exists, i.e. not yet handled before
  if (!!entity) {
    return
  }

  entity = new SharesBurn(id)
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
  if (totals.totalPooledEther != tokenRebasedEvent.params.preTotalEther) {
    log.warning('unexpected totalPooledEther {} {} ', [
      totals.totalPooledEther.toString(),
      tokenRebasedEvent.params.preTotalEther.toString()
    ])
  }

  if (totals.totalShares != tokenRebasedEvent.params.preTotalShares) {
    log.warning('unexpected totalPooledEther {} {} ', [
      totals.totalShares.toString(),
      tokenRebasedEvent.params.preTotalShares.toString()
    ])
  }

  assert(totals.totalPooledEther == tokenRebasedEvent.params.preTotalEther, 'Unexpected totalPooledEther!')
  assert(totals.totalShares == tokenRebasedEvent.params.preTotalShares, 'Unexpected totalPooledEther!')

  const totalRewardsEntity = _loadOrCreateTotalRewardEntity(event)
  totalRewardsEntity.totalPooledEtherBefore = totals.totalPooledEther
  totalRewardsEntity.totalSharesBefore = totals.totalShares

  // update totalPooledEther for correct SharesBurnt
  totals.totalPooledEther = tokenRebasedEvent.params.postTotalEther
  totals.save()

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

  // override and save correct totalShares for next mint transfers
  // (i.e. for calculation minted rewards), as we need new values before transfers
  totals.totalShares = tokenRebasedEvent.params.postTotalShares
  totals.save()

  // @todo check zero
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

  totalRewardsEntity.shares2mint = tokenRebasedEvent.params.sharesMintedAsFees
  totalRewardsEntity.timeElapsed = tokenRebasedEvent.params.timeElapsed

  // APR
  _calcAPR_v2(
    totalRewardsEntity,
    tokenRebasedEvent.params.preTotalEther,
    tokenRebasedEvent.params.postTotalEther,
    tokenRebasedEvent.params.preTotalShares,
    tokenRebasedEvent.params.postTotalShares,
    tokenRebasedEvent.params.timeElapsed
  )

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

  const totalRewardsEntity = _loadOrCreateTotalRewardEntity(event)

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

  assert(
    totalRewardsEntity.shares2mint == sharesToTreasury.plus(sharesToOperators),
    "shares2mint doesn't match sharesToTreasury+sharesToOperators"
  )

  // @todo calc
  // totalRewardsEntity.feeBasis = CurrentFee.feeBasisPoints!
  // totalRewardsEntity.treasuryFeeBasisPoints =
  //   CurrentFee.treasuryFeeBasisPoints!
  // totalRewardsEntity.insuranceFeeBasisPoints =
  //   CurrentFee.insuranceFeeBasisPoints!
  // totalRewardsEntity.operatorsFeeBasisPoints =
  //   CurrentFee.operatorsFeeBasisPoints!

  totalRewardsEntity.save()
}

export function handleApproval(event: Approval): void {
  let entity = new LidoApproval(event.transaction.hash.concatI32(event.logIndex.toI32()))
  entity.owner = event.params.owner
  entity.spender = event.params.spender
  entity.value = event.params.value
  entity.save()
}

export function handleFeeSet(event: FeeSet): void {
  const curFee = _loadCurrentFee(event)
  curFee.feeBasisPoints = BigInt.fromI32(event.params.feeBasisPoints)
  _saveCurrentFee(curFee, event)
}

export function handleFeeDistributionSet(event: FeeDistributionSet): void {
  const curFee = _loadCurrentFee(event)
  curFee.treasuryFeeBasisPoints = BigInt.fromI32(event.params.treasuryFeeBasisPoints)
  curFee.insuranceFeeBasisPoints = BigInt.fromI32(event.params.insuranceFeeBasisPoints)
  curFee.operatorsFeeBasisPoints = BigInt.fromI32(event.params.operatorsFeeBasisPoints)
  _saveCurrentFee(curFee, event)
}

export function handleLidoLocatorSet(event: LidoLocatorSet): void {
  const entity = _loadLidoConfig()
  entity.lidoLocator = event.params.lidoLocator
  _saveLidoConfig(entity, event)
}

export function handleResumed(event: Resumed): void {
  const entity = _loadLidoConfig()
  entity.isStopped = false
  _saveLidoConfig(entity, event)
}

export function handleStopped(event: Stopped): void {
  const entity = _loadLidoConfig()
  entity.isStopped = true
  _saveLidoConfig(entity, event)
}

export function handleELRewardsVaultSet(event: ELRewardsVaultSet): void {
  const entity = _loadLidoConfig()
  entity.elRewardsVault = event.params.executionLayerRewardsVault
  _saveLidoConfig(entity, event)
}

export function handleELRewardsWithdrawalLimitSet(event: ELRewardsWithdrawalLimitSet): void {
  const entity = _loadLidoConfig()
  entity.elRewardsWithdrawalLimitPoints = event.params.limitPoints
  _saveLidoConfig(entity, event)
}

export function handleProtocolContractsSet(event: ProtocolContactsSet): void {
  const entity = _loadLidoConfig()
  entity.insuranceFund = event.params.insuranceFund
  entity.oracle = event.params.oracle
  entity.treasury = event.params.treasury
  _saveLidoConfig(entity, event)
}

export function handleStakingLimitRemoved(event: StakingLimitRemoved): void {
  const entity = _loadLidoConfig()
  entity.maxStakeLimit = ZERO
  _saveLidoConfig(entity, event)
}

export function handleStakingLimitSet(event: StakingLimitSet): void {
  const entity = _loadLidoConfig()
  entity.maxStakeLimit = event.params.maxStakeLimit
  entity.stakeLimitIncreasePerBlock = event.params.stakeLimitIncreasePerBlock
  _saveLidoConfig(entity, event)
}

export function handleStakingResumed(event: StakingResumed): void {
  const entity = _loadLidoConfig()
  entity.isStakingPaused = false
  _saveLidoConfig(entity, event)
}

export function handleStakingPaused(event: StakingPaused): void {
  const entity = _loadLidoConfig()
  entity.isStakingPaused = true
  _saveLidoConfig(entity, event)
}

export function handleWithdrawalCredentialsSet(event: WithdrawalCredentialsSet): void {
  const entity = _loadLidoConfig()
  entity.withdrawalCredentials = event.params.withdrawalCredentials
  _saveLidoConfig(entity, event)

  // Cropping unused keys on withdrawal credentials change
  const keys = wcKeyCrops.get(event.params.withdrawalCredentials.toHexString())
  if (keys) {
    for (let i = 0; i < keys.length; i++) {
      store.remove('NodeOperatorSigningKey', keys[i])
    }
  }
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

function _loadCurrentFee(event: ethereum.Event): CurrentFee {
  let entity = CurrentFee.load('')
  if (!entity) {
    entity = new CurrentFee('')
    entity.treasuryFeeBasisPoints = ZERO
    entity.insuranceFeeBasisPoints = ZERO
    entity.operatorsFeeBasisPoints = ZERO
    entity.feeBasisPoints = ZERO
  }
  return entity
}

function _saveCurrentFee(entity: CurrentFee, event: ethereum.Event): void {
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex
  entity.save()
}

export function _loadLidoConfig(): LidoConfig {
  let entity = LidoConfig.load('')
  if (!entity) {
    entity = new LidoConfig('')

    // entity.insuranceFund = ZERO_ADDRESS
    // entity.oracle = ZERO_ADDRESS
    // entity.treasury = ZERO_ADDRESS

    entity.isStopped = true
    entity.isStakingPaused = true

    entity.maxStakeLimit = ZERO
    entity.stakeLimitIncreasePerBlock = ZERO

    entity.elRewardsVault = ZERO_ADDRESS
    entity.elRewardsWithdrawalLimitPoints = ZERO

    entity.withdrawalCredentials = ZERO_ADDRESS
    entity.wcSetBy = ZERO_ADDRESS

    entity.lidoLocator = ZERO_ADDRESS

    entity.elRewardsWithdrawalLimitPoints = ZERO
    entity.elRewardsVault = ZERO_ADDRESS
  }
  return entity
}

export function _saveLidoConfig(entity: LidoConfig, event: ethereum.Event): void {
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex
  entity.save()
}
