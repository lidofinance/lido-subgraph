import { BigInt, ethereum, log, store } from '@graphprotocol/graph-ts'
import {
  Lido,
  Approval as ApprovalEvent,
  BeaconValidatorsUpdated as BeaconValidatorsUpdatedEvent,
  ETHDistributed as ETHDistributedEvent,
  FeeDistributionSet as FeeDistributionSetEvent,
  FeeSet as FeeSetEvent,
  Resumed as ResumedEvent,
  SharesBurnt as SharesBurntEvent,
  Stopped as StoppedEvent,
  Submitted as SubmittedEvent,
  TokenRebased as TokenRebasedEvent,
  Transfer as TransferEvent,
  TransferShares as TransferSharesEvent,
  StakingLimitRemoved as StakingLimitRemovedEvent,
  StakingLimitSet as StakingLimitSetEvent,
  ELRewardsVaultSet as ELRewardsVaultSetEvent,
  ELRewardsWithdrawalLimitSet as ELRewardsWithdrawalLimitSetEvent,
  ProtocolContactsSet as ProtocolContactsSetEvent,
  StakingResumed as StakingResumedEvent,
  StakingPaused as StakingPausedEvent,
  WithdrawalCredentialsSet as WithdrawalCredentialsSetEvent,
  LidoLocatorSet as LidoLocatorSetEvent
} from '../generated/Lido/Lido'
import {
  LidoSubmission,
  CurrentFees,
  TotalReward,
  NodeOperatorsShares,
  NodeOperatorFees,
  LidoApproval,
  SharesBurn,
  LidoConfig,
  LidoTransfer
} from '../generated/schema'

import {
  ZERO,
  getAddress,
  ONE,
  CALCULATION_UNIT,
  ZERO_ADDRESS,
  network
} from './constants'
import {
  parseEventLogs,
  extractPairedEvent,
  getParsedEventByName,
  getRightPairedEventByLeftLogIndex,
  getParsedEvent,
  ParsedEvent
} from './parser'
import {
  _calcAPR_v2,
  _loadLidoTransferEntity,
  _loadSharesEntity,
  _loadStatsEntity,
  _loadTotalRewardEntity,
  _loadTotalsEntity,
  _updateHolders,
  _updateTransferBalances,
  _updateTransferShares,
  isLidoTransferShares,
  isLidoV2
} from './helpers'

import { wcKeyCrops } from './wcKeyCrops'

export function handleSubmitted(event: SubmittedEvent): void {
  let entity = new LidoSubmission(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  // let entity = new LidoSubmission(event.transaction.hash.toHex() + '-' + event.logIndex.toString())

  entity.sender = event.params.sender
  entity.amount = event.params.amount
  entity.referral = event.params.referral

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.transactionIndex = event.transaction.index
  entity.logIndex = event.logIndex

  // Loading totals
  const totals = _loadTotalsEntity(true)!

  let shares: BigInt
  // after TransferShares event has been added just take shares value from it
  // calc shares value otherwise
  if (isLidoTransferShares(event.block.number)) {
    // limit parsing by 2 next events
    // such approach cover both cases when Transfer was emitted before and wise versa
    const parsedEvents = parseEventLogs(
      event,
      event.address,
      event.logIndex,
      event.logIndex.plus(BigInt.fromI32(2))
    )
    // extracting only 'Transfer' and 'TransferShares' pairs
    const transferEventPairs = extractPairedEvent(
      parsedEvents,
      'Transfer',
      'TransferShares'
    )

    // expecting at only one Transfer events pair
    assert(
      transferEventPairs.length == 1,
      'no Transfer/TransferShares events on submit'
    )

    // const eventTransfer = getParsedEvent<Transfer>(transferEventPairs[0], 0)
    const eventTransferShares = getParsedEvent<TransferSharesEvent>(
      transferEventPairs[0],
      1
    )
    shares = eventTransferShares.params.sharesValue
  } else {
    /**
     * Use 1:1 ether-shares ratio when:
     * 1. Nothing was staked yet
     * 2. Someone staked something, but shares got rounded to 0 eg staking 1 wei
     **/

    // Check if contract has no ether or shares yet
    shares = totals.totalPooledEther.isZero()
      ? event.params.amount
      : event.params.amount
          .times(totals.totalShares)
          .div(totals.totalPooledEther)

    // handle the case when staked amount ~1 wei, that shares to mint got rounded to 0
    if (shares.isZero()) {
      shares = event.params.amount
    }
  }

  entity.shares = shares

  const sharesEntity = _loadSharesEntity(event.params.sender, true)!
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
  entity.balanceAfter = entity.sharesAfter
    .times(totals.totalPooledEther)
    .div(totals.totalShares)
  entity.save()
}

export function handleTransfer(event: TransferEvent): void {
  const entity = _loadLidoTransferEntity(event)

  // Entity is already created at this point
  const totals = _loadTotalsEntity()!
  assert(totals.totalPooledEther > ZERO, 'transfer with zero totalPooledEther')

  entity.totalPooledEther = totals.totalPooledEther
  entity.totalShares = totals.totalShares

  let eventTransferShares: TransferSharesEvent | null = null
  // now we should parse the whole tx receipt to be sure pair extraction is accurate
  if (isLidoTransferShares(event.block.number)) {
    const parsedEvents = parseEventLogs(event, event.address)
    // TransferShares should exists after according upgrade
    eventTransferShares = getRightPairedEventByLeftLogIndex<
      TransferSharesEvent
    >(
      extractPairedEvent(parsedEvents, 'Transfer', 'TransferShares'),
      event.logIndex
    )!
    entity.shares = eventTransferShares.params.sharesValue

    // skip handling if nothing to handle
    if (entity.value.isZero() && entity.shares.isZero()) {
      return
    }
  } else {
    // usual transfer without TransferShares event, so calc shares
    entity.shares = entity.value
      .times(totals.totalShares)
      .div(totals.totalPooledEther)
  }

  if (entity.from == ZERO_ADDRESS) {
    // process mint transfers

    // check if totalReward record exists, so assuming it's mint during Oracle report
    const totalRewardsEntity = TotalReward.load(event.transaction.hash)
    if (totalRewardsEntity) {
      /// @deprecated
      // entity.mintWithoutSubmission = true

      if (isLidoV2(event.block.number)) {
        // after V2 upgrade, TotalReward is handled by handleETHDistributed
      } else {
        /**
         * Handling fees during oracle report, in order:
         * 1. Insurance Fund Transfer
         * 2. Node Operator Reward Transfers
         * 3. Treasury Fund Transfer with remaining dust or just rounding dust
         **/

        // in case TreasureAddress = InsuranceAddress and insuranceFeeBasisPoints no zero assuming the first tx should go to Insurance
        if (
          entity.to == getAddress('INSURANCE_FUND') &&
          !totalRewardsEntity.insuranceFeeBasisPoints.isZero() &&
          totalRewardsEntity.insuranceFee.isZero()
        ) {
          // Handling the Insurance Fee transfer event
          totalRewardsEntity.insuranceFee = totalRewardsEntity.insuranceFee.plus(
            entity.value
          )

          // sanity assertion
          if (eventTransferShares) {
            assert(
              entity.shares == totalRewardsEntity.sharesToInsuranceFund,
              'Unexpected sharesToInsuranceFund'
            )
          } else {
            // overriding calculated value
            entity.shares = totalRewardsEntity.sharesToInsuranceFund
          }
        } else if (entity.to == getAddress('TREASURE')) {
          // Handling the Treasury Fund transfer event

          // log.warning('before: treasuryFee {} dust {}', [
          //   totalRewardsEntity.treasuryFee.toString(),
          //   totalRewardsEntity.dust.toString()
          // ])
          // log.warning('before: sharesToTreasury {} dustSharesToTreasury {}', [
          //   totalRewardsEntity.sharesToTreasury.toString(),
          //   totalRewardsEntity.dustSharesToTreasury.toString()
          // ])

          let shares: BigInt
          // Dust exists only when treasuryFeeBasisPoints is 0 and prior Lido v2
          if (totalRewardsEntity.treasuryFeeBasisPoints.isZero()) {
            totalRewardsEntity.dust = totalRewardsEntity.dust.plus(entity.value)
            shares = totalRewardsEntity.dustSharesToTreasury
          } else {
            totalRewardsEntity.treasuryFee = totalRewardsEntity.treasuryFee.plus(
              entity.value
            )
            shares = totalRewardsEntity.sharesToTreasury
          }

          // log.warning('entity.value {} entity.shares {} shares {}', [
          //   entity.value.toString(),
          //   entity.shares.toString(),
          //   shares.toString()
          // ])
          // log.warning('after: treasuryFee {} dust {}', [
          //   totalRewardsEntity.treasuryFee.toString(),
          //   totalRewardsEntity.dust.toString()
          // ])
          // log.warning('after: sharesToTreasury {} dustSharesToTreasury {}', [
          //   totalRewardsEntity.sharesToTreasury.toString(),
          //   totalRewardsEntity.dustSharesToTreasury.toString()
          // ])

          if (eventTransferShares) {
            assert(entity.shares == shares, 'Unexpected sharesToTreasury')
          } else {
            // overriding calculated value
            entity.shares = shares
          }
        } else {
          // Handling fee transfer to node operator prior v2 upgrade
          // after v2 there are only transfers to SR modules

          const nodeOperatorFee = new NodeOperatorFees(
            event.transaction.hash.concatI32(event.logIndex.toI32())
          )
          // const nodeOperatorFee = new NodeOperatorFees(event.transaction.hash.toHex() + '-' + event.logIndex.toString())

          // Reference to TotalReward entity
          nodeOperatorFee.totalReward = totalRewardsEntity.id
          nodeOperatorFee.address = entity.to
          nodeOperatorFee.fee = entity.value
          nodeOperatorFee.save()

          // Entity should already exists at this point
          const nodeOperatorShare = NodeOperatorsShares.load(
            event.transaction.hash.concat(entity.to)
          )!
          // const nodeOperatorShare = NodeOperatorsShares.load(event.transaction.hash.toHex() + '-' + entity.to.toHexString())!

          if (eventTransferShares) {
            assert(
              entity.shares == nodeOperatorShare.shares,
              'Unexpected nodeOperatorsShares'
            )
          } else {
            entity.shares = nodeOperatorShare.shares
          }
          totalRewardsEntity.operatorsFee = totalRewardsEntity.operatorsFee.plus(
            entity.value
          )
        }

        if (!entity.value.isZero()) {
          // decreasing saved total rewards to (remainder will be users reward)
          assert(
            totalRewardsEntity.totalRewards >= entity.value,
            'negative totalRewards'
          )
          totalRewardsEntity.totalRewards = totalRewardsEntity.totalRewards.minus(
            entity.value
          )
          // increasing total system fee value
          totalRewardsEntity.totalFee = totalRewardsEntity.totalFee.plus(
            entity.value
          )
          totalRewardsEntity.save()
        }
      }
    } else {
      // transfer after submit
      /// @deprecated
      // entity.mintWithoutSubmission = false

      if (!eventTransferShares) {
        // prior TransferShares logic
        // Submission entity should exists with the previous logIndex (as mint Transfer occurs only after Submit event)
        let submissionEntity = LidoSubmission.load(
          event.transaction.hash.concatI32(event.logIndex.minus(ONE).toI32())
        )!
        // let submissionEntity = LidoSubmission.load(
        //   event.transaction.hash.toHex() + '-' + event.logIndex.minus(ONE).toString()
        // )!

        // throws error if no submissionEntity
        entity.shares = submissionEntity.shares
      }
    }
  }
  // upd account's shares and stats
  _updateTransferShares(entity)
  _updateTransferBalances(entity)
  _updateHolders(entity)
  entity.save()
}

export function handleSharesBurnt(event: SharesBurntEvent): void {
  // shares are burned only during oracle report from LidoBurner contract
  const id = event.transaction.hash.concatI32(event.logIndex.toI32())
  // const id = event.transaction.hash.toHex() + '-' + event.logIndex.toString()
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

  // Totals should be already non-null here
  const totals = _loadTotalsEntity()!
  totals.totalShares = totals.totalShares.minus(event.params.sharesAmount)
  assert(totals.totalShares > ZERO, 'negative totalShares after shares burn')
  totals.save()

  // create Transfer event
  const txEntity = new LidoTransfer(id)

  txEntity.from = event.params.account
  txEntity.to = ZERO_ADDRESS
  txEntity.block = event.block.number
  txEntity.blockTime = event.block.timestamp
  txEntity.transactionHash = event.transaction.hash
  txEntity.transactionIndex = event.transaction.index

  txEntity.logIndex = event.logIndex

  txEntity.value = event.params.postRebaseTokenAmount
  txEntity.shares = event.params.sharesAmount
  txEntity.totalPooledEther = totals.totalPooledEther
  txEntity.totalShares = totals.totalShares

  // from acc
  txEntity.sharesBeforeDecrease = ZERO
  txEntity.sharesAfterDecrease = ZERO
  txEntity.balanceAfterDecrease = ZERO

  // to acc, will be set later
  txEntity.sharesBeforeIncrease = ZERO
  txEntity.sharesAfterIncrease = ZERO
  txEntity.balanceAfterIncrease = ZERO

  // upd account's shares and stats
  _updateTransferShares(txEntity)
  _updateTransferBalances(txEntity)
  _updateHolders(txEntity)

  txEntity.save()
  // if (event.params.account != ZERO_ADDRESS) {
  // account should have shares
  // const shares = _loadSharesEntity(event.params.account)!
  // shares.shares = shares.shares.minus(event.params.sharesAmount)
  // assert(shares.shares > ZERO, 'negative account shares after shares burn')
  // shares.save()

  // const balanceAfterDecrease = shares.shares.times(totals.totalPooledEther).div(totals.totalShares)

  // const holder = Holder.load(event.params.account)
  // if (holder) {
  //   if (holder.hasBalance && balanceAfterDecrease.isZero()) {
  //     holder.hasBalance = false
  //     const stats = _loadStatsEntity()
  //     stats.uniqueHolders = stats.uniqueHolders.minus(ONE)
  //     stats.save()
  //   }
  //   holder.save()
  // } // else should not to be

  // }
}

// only for Lido v2

// event WithdrawalsFinalized (or WithdrawalsBatchFinalized) should be captured by Subgraph right before
// and totalPooledEther will be decreased by amountETHToLock
export function handleETHDistributed(event: ETHDistributedEvent): void {
  // we should process token rebase here as TokenRebased event fired last but we need new values before transfers
  // parse all events from tx receipt
  const parsedEvents = parseEventLogs(event, event.address)

  // TokenRebased event should exists
  const tokenRebasedEvent = getParsedEventByName<TokenRebasedEvent>(
    parsedEvents,
    'TokenRebased',
    event.logIndex
  )
  if (!tokenRebasedEvent) {
    log.critical(
      'Event TokenRebased not found when ETHDistributed! block: {} txHash: {} logIdx: {} ',
      [
        event.block.number.toString(),
        event.transaction.hash.toHexString(),
        event.logIndex.toString()
      ]
    )
    return
  }

  // Totals should be already non-null on oracle report
  const totals = _loadTotalsEntity()!
  assert(
    totals.totalPooledEther == tokenRebasedEvent.params.preTotalEther,
    "totalPooledEther mismatch report's preTotalEther"
  )
  assert(
    totals.totalShares == tokenRebasedEvent.params.preTotalShares,
    "totalShares mismatch report's preTotalShares"
  )

  // update totalPooledEther for correct SharesBurnt
  totals.totalPooledEther = tokenRebasedEvent.params.postTotalEther
  totals.save()

  // @note saved Transfer event from WQ to Burner will contain wrong totalPooledEther value due to internal update of CL_BALANCE without event
  // try to find and handle SharesBurnt event which expect not yet changed totalShares
  const sharesBurntEvent = getParsedEventByName<SharesBurntEvent>(
    parsedEvents,
    'SharesBurnt',
    event.logIndex,
    tokenRebasedEvent.logIndex
  )

  if (sharesBurntEvent) {
    // log.warning('Event sharesBurntEvent when ETHDistributed! block: {} txHash: {} logIdx: {} ', [
    //   sharesBurntEvent.block.number.toString(),
    //   sharesBurntEvent.transaction.hash.toHexString(),
    //   sharesBurntEvent.logIndex.toString()
    // ])
    handleSharesBurnt(sharesBurntEvent)
  }

  // override and save correct totalShares for next mint transfers
  // (i.e. for calculation minted rewards), as we need new values before transfers
  totals.totalShares = tokenRebasedEvent.params.postTotalShares
  totals.save()

  // Don’t mint/distribute any protocol fee on the non-profitable Lido oracle report
  // (when consensus layer balance delta is zero or negative).
  // See LIP-12 for details:
  // https://research.lido.fi/t/lip-12-on-chain-part-of-the-rewards-distribution-after-the-merge/1625
  const postCLTotalBalance = event.params.postCLBalance.plus(
    event.params.withdrawalsWithdrawn
  )
  if (postCLTotalBalance <= event.params.preCLBalance) {
    return
  }

  const totalRewards = postCLTotalBalance
    .minus(event.params.preCLBalance)
    .plus(event.params.executionLayerRewardsWithdrawn)

  const totalRewardsEntity = _loadTotalRewardEntity(event, true)!

  totalRewardsEntity.totalRewards = totalRewards
  totalRewardsEntity.totalRewardsWithFees = totalRewardsEntity.totalRewards
  totalRewardsEntity.mevFee = event.params.executionLayerRewardsWithdrawn

  _processTokenRebase(
    totalRewardsEntity,
    event,
    tokenRebasedEvent,
    parsedEvents
  )

  totalRewardsEntity.save()
}

export function _processTokenRebase(
  entity: TotalReward,
  ethDistributedEvent: ETHDistributedEvent,
  tokenRebasedEvent: TokenRebasedEvent,
  parsedEvents: ParsedEvent[]
): void {
  entity.totalPooledEtherBefore = tokenRebasedEvent.params.preTotalEther
  entity.totalSharesBefore = tokenRebasedEvent.params.preTotalShares
  entity.totalPooledEtherAfter = tokenRebasedEvent.params.postTotalEther
  entity.totalSharesAfter = tokenRebasedEvent.params.postTotalShares
  entity.shares2mint = tokenRebasedEvent.params.sharesMintedAsFees
  entity.timeElapsed = tokenRebasedEvent.params.timeElapsed

  // extracting only 'Transfer' and 'TransferShares' pairs between ETHDistributed to TokenRebased
  // assuming the ETHDistributed and TokenRebased events are presents in tx only once
  const transferEventPairs = extractPairedEvent(
    parsedEvents,
    'Transfer',
    'TransferShares',
    ethDistributedEvent.logIndex, // start from ETHDistributed event
    tokenRebasedEvent.logIndex // and to the TokenRebased event
  )

  let sharesToTreasury = ZERO
  let sharesToOperators = ZERO
  let treasuryFee = ZERO
  let operatorsFee = ZERO

  // NB: there is no insurance fund anymore since v2
  for (let i = 0; i < transferEventPairs.length; i++) {
    const eventTransfer = getParsedEvent<TransferEvent>(
      transferEventPairs[i],
      0
    )
    const eventTransferShares = getParsedEvent<TransferSharesEvent>(
      transferEventPairs[i],
      1
    )

    const treasureAddress = getAddress('TREASURE')
    // log.warning('treasureAddress {}', [treasureAddress.toHexString()])
    // process only mint events
    if (eventTransfer.params.from == ZERO_ADDRESS) {
      // log.warning('eventTransfer.params.to {}', [eventTransfer.params.to.toHexString()])

      if (eventTransfer.params.to == treasureAddress) {
        // mint to treasure
        sharesToTreasury = sharesToTreasury.plus(
          eventTransferShares.params.sharesValue
        )
        treasuryFee = treasuryFee.plus(eventTransfer.params.value)

        // log.warning('sharesToTreasury": transfer  {} total {} totalFee {}', [
        //   eventTransferShares.params.sharesValue.toString(),
        //   sharesToTreasury.toString(),
        //   treasuryFee.toString()
        // ])
      } else {
        // mint to SR module
        sharesToOperators = sharesToOperators.plus(
          eventTransferShares.params.sharesValue
        )
        operatorsFee = operatorsFee.plus(eventTransfer.params.value)

        // log.warning('operatorsFee: transfer {} total {} totalFee {}', [
        //   eventTransferShares.params.sharesValue.toString(),
        //   sharesToOperators.toString(),
        //   operatorsFee.toString()
        // ])
      }
    }
  }

  entity.sharesToTreasury = sharesToTreasury
  entity.treasuryFee = treasuryFee
  entity.sharesToOperators = sharesToOperators
  entity.operatorsFee = operatorsFee
  entity.totalFee = treasuryFee.plus(operatorsFee)
  entity.totalRewards = entity.totalRewardsWithFees.minus(entity.totalFee)

  if (entity.shares2mint != sharesToTreasury.plus(sharesToOperators)) {
    log.critical(
      'totalRewardsEntity.shares2mint != sharesToTreasury + sharesToOperators: shares2mint {} sharesToTreasury {} sharesToOperators {}',
      [
        entity.shares2mint.toString(),
        sharesToTreasury.toString(),
        sharesToOperators.toString()
      ]
    )
  }
  // @todo calc for compatibility
  // Total fee of the protocol eg 1000 / 100 = 10% fee
  // feeBasisPoints = 1000
  // const sharesToInsuranceFund = shares2mint.times(totalRewardsEntity.insuranceFeeBasisPoints).div(CALCULATION_UNIT)
  // const sharesToOperators = shares2mint.times(totalRewardsEntity.operatorsFeeBasisPoints).div(CALCULATION_UNIT)

  entity.treasuryFeeBasisPoints = treasuryFee
    .times(CALCULATION_UNIT)
    .div(entity.totalFee)
  entity.operatorsFeeBasisPoints = operatorsFee
    .times(CALCULATION_UNIT)
    .div(entity.totalFee)
  entity.feeBasis = entity.totalFee
    .times(CALCULATION_UNIT)
    .div(entity.totalRewardsWithFees)

  // APR
  _calcAPR_v2(
    entity,
    tokenRebasedEvent.params.preTotalEther,
    tokenRebasedEvent.params.postTotalEther,
    tokenRebasedEvent.params.preTotalShares,
    tokenRebasedEvent.params.postTotalShares,
    tokenRebasedEvent.params.timeElapsed
  )

  entity.save()
}

export function handleApproval(event: ApprovalEvent): void {
  let entity = new LidoApproval(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.owner = event.params.owner
  entity.spender = event.params.spender
  entity.value = event.params.value
  entity.save()
}

export function handleFeeSet(event: FeeSetEvent): void {
  const curFee = _loadCurrentFees()
  curFee.feeBasisPoints = BigInt.fromI32(event.params.feeBasisPoints)
  curFee.save()
}

export function handleFeeDistributionSet(event: FeeDistributionSetEvent): void {
  const curFee = _loadCurrentFees()
  curFee.treasuryFeeBasisPoints = BigInt.fromI32(
    event.params.treasuryFeeBasisPoints
  )
  curFee.insuranceFeeBasisPoints = BigInt.fromI32(
    event.params.insuranceFeeBasisPoints
  )
  curFee.operatorsFeeBasisPoints = BigInt.fromI32(
    event.params.operatorsFeeBasisPoints
  )
  curFee.save()
}

export function handleLidoLocatorSet(event: LidoLocatorSetEvent): void {
  const entity = _loadLidoConfig()
  entity.lidoLocator = event.params.lidoLocator
  entity.save()
}

export function handleResumed(event: ResumedEvent): void {
  const entity = _loadLidoConfig()
  entity.isStopped = false
  entity.save()
}

export function handleStopped(event: StoppedEvent): void {
  const entity = _loadLidoConfig()
  entity.isStopped = true
  entity.save()
  //entity.save()
}

export function handleELRewardsVaultSet(event: ELRewardsVaultSetEvent): void {
  const entity = _loadLidoConfig()
  entity.elRewardsVault = event.params.executionLayerRewardsVault
  entity.save()
  //entity.save()
}

export function handleELRewardsWithdrawalLimitSet(
  event: ELRewardsWithdrawalLimitSetEvent
): void {
  const entity = _loadLidoConfig()
  entity.elRewardsWithdrawalLimitPoints = event.params.limitPoints
  entity.save()
  //entity.save()
}

export function handleProtocolContractsSet(
  event: ProtocolContactsSetEvent
): void {
  const entity = _loadLidoConfig()
  entity.insuranceFund = event.params.insuranceFund
  entity.oracle = event.params.oracle
  entity.treasury = event.params.treasury
  entity.save()
  //entity.save()
}

export function handleStakingLimitRemoved(
  event: StakingLimitRemovedEvent
): void {
  const entity = _loadLidoConfig()
  entity.maxStakeLimit = ZERO
  entity.save()
}

export function handleStakingLimitSet(event: StakingLimitSetEvent): void {
  const entity = _loadLidoConfig()
  entity.maxStakeLimit = event.params.maxStakeLimit
  entity.stakeLimitIncreasePerBlock = event.params.stakeLimitIncreasePerBlock
  entity.save()
}

export function handleStakingResumed(event: StakingResumedEvent): void {
  const entity = _loadLidoConfig()
  entity.isStakingPaused = false
  entity.save()
}

export function handleStakingPaused(event: StakingPausedEvent): void {
  const entity = _loadLidoConfig()
  entity.isStakingPaused = true
  entity.save()
}

export function handleWithdrawalCredentialsSet(
  event: WithdrawalCredentialsSetEvent
): void {
  const entity = _loadLidoConfig()
  entity.withdrawalCredentials = event.params.withdrawalCredentials
  entity.save()

  // Cropping unused keys on withdrawal credentials change
  if (wcKeyCrops.has(event.params.withdrawalCredentials.toHexString())) {
    const keys = wcKeyCrops.get(
      event.params.withdrawalCredentials.toHexString()
    )
    for (let i = 0; i < keys.length; i++) {
      store.remove('NodeOperatorSigningKey', keys[i])
    }
  }
}

// Handling validators count correction during the upgrade at block 7127807
// https://goerli.etherscan.io/tx/0xa9111b9bf19777ca08902fbd9c1dc8efc7a5bf61766f92bd469b522477257195#eventlog
//
// Note: This event only appears on Goerli testnet, so the handler is not used on Mainnet
export function handleBeaconValidatorsUpdated(
  event: BeaconValidatorsUpdatedEvent
): void {
  // Totals entity should exists
  const totals = _loadTotalsEntity()!
  // Just grab the correct value from the contract
  totals.totalPooledEther = Lido.bind(event.address).getTotalPooledEther()
  totals.save()
}

function _loadCurrentFees(): CurrentFees {
  let entity = CurrentFees.load('')
  if (!entity) {
    entity = new CurrentFees('')
    entity.treasuryFeeBasisPoints = ZERO
    entity.insuranceFeeBasisPoints = ZERO
    entity.operatorsFeeBasisPoints = ZERO
    entity.feeBasisPoints = ZERO
  }
  return entity
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
