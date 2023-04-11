import { BigInt } from '@graphprotocol/graph-ts'
import {
  Stopped,
  Resumed,
  Transfer,
  Approval,
  Submitted,
  Unbuffered,
  ELRewardsReceived,
  StakingLimitRemoved,
  StakingLimitSet as StakingLimitSetEvent,
  StakingResumed,
  StakingPaused,
  TransferShares,
  SharesBurnt,
  ETHDistributed,
  TokenRebased
} from '../generated/Lido/Lido'
import {
  LidoStopped,
  LidoResumed,
  LidoTransfer,
  LidoApproval,
  LidoSubmission,
  LidoUnbuffered,
  StakingLimitRemove,
  StakingLimitSet,
  StakingResume,
  StakingPause,
  SharesTransfer,
  SharesBurn,
  Holder
} from '../generated/schema'

import {
  handleFeeDistributionSet,
  handleWithdrawalCredentialsSet,
  handleFeeSet,
  handleProtocolContractsSet,
  handleELRewardsWithdrawalLimitSet,
  handleELRewardsVaultSet,
  handleBeaconValidatorsUpdated,
  handleTestnetBlock,
  handleWithdrawal,
  handleELRewardsReceived as handleELRewardsReceived_v1,
  handleSubmitted as handleSubmitted_v1,
  handleTransfer as handleTransfer_v1,
  handleSharesBurnt as handleSharesBurnt_v1
} from './v1/Lido'

import { E27_PRECISION_BASE } from './constants'

import {
  ZERO,
  getAddress,
  ONE,
  CALCULATION_UNIT,
  ZERO_ADDRESS
} from './constants'
import {
  parseEventLogs,
  extractPairedEvent,
  findPairedEventByLogIndex,
  findParsedEventByName,
  filterParsedEventsByLogIndexRange
} from './parser'
import {
  _loadOrCreateLidoTransferEntity,
  _loadOrCreateSharesEntity,
  _loadOrCreateStatsEntity,
  _loadOrCreateTotalRewardEntity,
  _loadOrCreateTotalsEntity,
  _updateHolders,
  _updateTransferBalances,
  _updateTransferShares,
  isLidoV2
} from './helpers'

export function handleETHDistributed(event: ETHDistributed): void {
  // event.params.preCLBalance
  // event.params.postCLBalance
  // event.params.postBufferedEther
  // event.params.withdrawalsWithdrawn
  // event.params.executionLayerRewardsWithdrawn

  // we should process token rebase here as TokenRebased event fired last but we need new values before transfers
  // parse all events from tx receipt
  const parsedEvents = parseEventLogs(event, event.address)

  // find ETHDistributed logIndex
  const rebasedParsedEvent = findParsedEventByName(parsedEvents, 'TokenRebased')
  if (!rebasedParsedEvent) {
    throw new Error('EVENT NOT FOUND: TokenRebased')
  }
  const rebaseEvent = changetype<TokenRebased>(rebasedParsedEvent.event)

  let totals = _loadOrCreateTotalsEntity()
  let totalRewardsEntity = _loadOrCreateTotalRewardEntity(rebaseEvent)
  totalRewardsEntity.totalPooledEtherBefore = totals.totalPooledEther
  totalRewardsEntity.totalSharesBefore = totals.totalShares

  totals.totalPooledEther = rebaseEvent.params.postTotalEther
  totals.totalShares = rebaseEvent.params.postTotalShares
  totals.save()

  totalRewardsEntity.totalPooledEtherAfter = totals.totalPooledEther
  totalRewardsEntity.totalSharesAfter = totals.totalShares

  totalRewardsEntity.totalRewardsWithFees = totalRewardsEntity.totalPooledEtherAfter.minus(
    totalRewardsEntity.totalPooledEtherBefore
  )
  totalRewardsEntity.totalRewards = totalRewardsEntity.totalRewardsWithFees

  totalRewardsEntity.shares2mint = rebaseEvent.params.sharesMintedAsFees
  // there is no insurance fund anymore
  totalRewardsEntity.sharesToInsuranceFund = ZERO

  // extracting only 'Transfer' and 'TransferShares' pairs between ETHDistributed to TokenRebased
  // assuming the ETHDistributed and TokenRebased events are presents in tx only once
  const transferEventPairs = extractPairedEvent(
    filterParsedEventsByLogIndexRange(
      parsedEvents,
      event.logIndex,
      rebaseEvent.logIndex
    ),
    ['Transfer', 'TransferShares']
  )

  let sharesToTreasury = ZERO
  let sharesToOperators = ZERO

  for (let i = 0; i < transferEventPairs.length; i++) {
    const eventTransfer = changetype<Transfer>(transferEventPairs[0][0].event)
    const eventTransferShares = changetype<TransferShares>(
      transferEventPairs[0][1].event
    )

    // process only mint events
    if (eventTransfer.params.from == ZERO_ADDRESS) {
      if (eventTransfer.params.to == getAddress('TREASURE')) {
        sharesToTreasury = sharesToTreasury.plus(
          eventTransferShares.params.sharesValue
        )
      } else {
        sharesToOperators = sharesToOperators.plus(
          eventTransferShares.params.sharesValue
        )

        totalRewardsEntity.operatorsFee = totalRewardsEntity.operatorsFee.plus(
          eventTransfer.params.value
        )
      }
      totalRewardsEntity.totalFee = totalRewardsEntity.totalFee.plus(
        eventTransfer.params.value
      )
    }
  }

  totalRewardsEntity.sharesToOperators = sharesToOperators
  totalRewardsEntity.sharesToTreasury = sharesToTreasury

  assert(
    sharesToOperators ==
      rebaseEvent.params.sharesMintedAsFees.minus(sharesToTreasury)
  )

  // @todo check
  totalRewardsEntity.mevFee = event.params.executionLayerRewardsWithdrawn
  totalRewardsEntity.dustSharesToTreasury = ZERO

  // totalRewardsEntity.feeBasis = currentFees.feeBasisPoints!
  // totalRewardsEntity.treasuryFeeBasisPoints =
  //   currentFees.treasuryFeeBasisPoints!
  // totalRewardsEntity.insuranceFeeBasisPoints =
  //   currentFees.insuranceFeeBasisPoints!
  // totalRewardsEntity.operatorsFeeBasisPoints =
  //   currentFees.operatorsFeeBasisPoints!

  // APR
  totalRewardsEntity.preTotalPooledEther = rebaseEvent.params.preTotalEther
  totalRewardsEntity.postTotalPooledEther = rebaseEvent.params.postTotalEther
  totalRewardsEntity.timeElapsed = rebaseEvent.params.timeElapsed
  totalRewardsEntity.totalShares = rebaseEvent.params.postTotalShares

  let preShareRate = rebaseEvent.params.preTotalEther
    .toBigDecimal()
    .times(E27_PRECISION_BASE)
    .div(rebaseEvent.params.preTotalShares.toBigDecimal())
  let postShareRate = rebaseEvent.params.postTotalEther
    .toBigDecimal()
    .times(E27_PRECISION_BASE)
    .div(rebaseEvent.params.postTotalShares.toBigDecimal())
  let secondsInYear = BigInt.fromI32(60 * 60 * 24 * 365).toBigDecimal()

  let apr = secondsInYear
    .times(postShareRate.minus(preShareRate))
    .div(preShareRate)
    .div(rebaseEvent.params.timeElapsed.toBigDecimal())

  totalRewardsEntity.apr = apr
  totalRewardsEntity.aprRaw = apr
}

export function handleTokenRebase(event: TokenRebased): void {
  // skip direct handling due to event will be processed as part of handleETHDistributed
}

export function handleTransfer(event: Transfer): void {
  if (!isLidoV2()) {
    handleTransfer_v1(event)
    return
  }

  // now we should parse the whole tx receipt to be sure pair extraction is accurate
  const parsedEvents = parseEventLogs(event, event.address)
  // extracting only 'Transfer' and 'TransferShares' pairs and find the item which contains current event
  const transferEventPair = findPairedEventByLogIndex(
    extractPairedEvent(parsedEvents, ['Transfer', 'TransferShares']),
    event.logIndex
  )

  if (!transferEventPair) {
    throw new Error('EVENT NOT FOUND: Transfer/TransferShares')
  }

  let entity = _loadOrCreateLidoTransferEntity(event)
  const eventTransferShares = changetype<TransferShares>(
    transferEventPair[1].event
  )
  entity.shares = eventTransferShares.params.sharesValue

  // Total entity should be already created at this point
  let totals = _loadOrCreateTotalsEntity()

  entity.totalPooledEther = totals.totalPooledEther
  entity.totalShares = totals.totalShares

  _updateTransferShares(entity)
  _updateTransferBalances(entity)
  _updateHolders(entity)

  entity.save()
}

export function handleSubmitted(event: Submitted): void {
  if (!isLidoV2()) {
    handleSubmitted_v1(event)
    return
  }

  let entity = new LidoSubmission(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.transactionIndex = event.transaction.index
  entity.logIndex = event.logIndex
  entity.transactionLogIndex = event.transactionLogIndex
  entity.sender = event.params.sender
  entity.amount = event.params.amount
  entity.referral = event.params.referral

  // Expecting that Transfer should be after Submission but no later than 2 log events after it
  const parsedEvents = parseEventLogs(
    event,
    event.address,
    event.logIndex,
    event.logIndex.plus(BigInt.fromI32(2))
  )

  // extracting only 'Transfer' and 'TransferShares' pairs
  const transferEventPairs = extractPairedEvent(parsedEvents, [
    'Transfer',
    'TransferShares'
  ])

  // expecting only one Transfer events pair
  if (transferEventPairs.length == 0) {
    throw new Error('EVENT NOT FOUND: Transfer/TransferShares')
  }

  // const eventTransfer = changetype<Transfer>(transferEvents[0][0].event)
  const eventTransferShares = changetype<TransferShares>(
    transferEventPairs[0][1].event
  )

  /**
   Use 1:1 ether-shares ratio when:
   1. Nothing was staked yet
   2. Someone staked something, but shares got rounded to 0 eg staking 1 wei
  **/
  entity.shares = eventTransferShares.params.sharesValue.isZero()
    ? event.params.amount
    : eventTransferShares.params.sharesValue

  // get address shares
  const sharesEntity = _loadOrCreateSharesEntity(event.params.sender)
  entity.sharesBefore = sharesEntity.shares
  entity.sharesAfter = entity.sharesBefore.plus(entity.shares)

  const totals = _loadOrCreateTotalsEntity()
  entity.totalPooledEtherBefore = totals.totalPooledEther
  entity.totalSharesBefore = totals.totalShares
  // Increasing Total
  totals.totalPooledEther = totals.totalPooledEther.plus(event.params.amount)
  totals.totalShares = totals.totalShares.plus(entity.shares)

  entity.totalPooledEtherAfter = totals.totalPooledEther
  entity.totalSharesAfter = totals.totalShares

  totals.save()

  // Calculating new balance
  entity.balanceAfter = entity.sharesAfter
    .times(totals.totalPooledEther)
    .div(totals.totalShares)

  entity.save()
}

export function handleTransferShares(event: TransferShares): void {
  // skip direct handling due to event will be processed as part of handleTransfer
  // keep v1 scheme compatibility
  let entity = new SharesTransfer(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.from = event.params.from
  entity.sharesValue = event.params.sharesValue
  entity.to = event.params.to
  entity.save()
}

export function handleSharesBurnt(event: SharesBurnt): void {
  if (!isLidoV2()) {
    handleSharesBurnt_v1(event)
    return
  }

  // shares are burned only during oracle report from LidoBurner contract
  let entity = new SharesBurn(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  entity.account = event.params.account
  entity.postRebaseTokenAmount = event.params.postRebaseTokenAmount
  entity.preRebaseTokenAmount = event.params.preRebaseTokenAmount
  entity.sharesAmount = event.params.sharesAmount
  entity.save()

  // skip totals processing in favor of the handleETHDistributed method

  if (event.params.account != ZERO_ADDRESS) {
    const totals = _loadOrCreateTotalsEntity()
    const stats = _loadOrCreateStatsEntity()
    const shares = _loadOrCreateSharesEntity(event.params.account)
    shares.shares = shares.shares.minus(event.params.sharesAmount)
    shares.save()

    const balanceAfterDecrease = shares.shares
      .times(totals.totalPooledEther)
      .div(totals.totalShares)

    const holder = Holder.load(event.params.account)
    if (holder) {
      if (!holder.balance.isZero() && balanceAfterDecrease.isZero()) {
        stats.uniqueHolders = stats.uniqueHolders.minus(ONE)
      }
      holder.balance = balanceAfterDecrease
      holder.save()
    } // else should not be

    stats.save()
  }
}

export function handleELRewardsReceived(event: ELRewardsReceived): void {
  if (!isLidoV2()) {
    handleELRewardsReceived_v1(event)
    return
  }
  // else skip in favor of the handleETHDistributed method
}

export function handleStopped(event: Stopped): void {
  let entity = new LidoStopped(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.save()
}

export function handleResumed(event: Resumed): void {
  let entity = new LidoResumed(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.save()
}

export function handleApproval(event: Approval): void {
  let entity = new LidoApproval(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  entity.owner = event.params.owner
  entity.spender = event.params.spender
  entity.value = event.params.value
  entity.save()
}

export function handleUnbuffered(event: Unbuffered): void {
  let entity = new LidoUnbuffered(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  entity.amount = event.params.amount
  entity.save()
}

export function handleStakingLimitRemoved(event: StakingLimitRemoved): void {
  let entity = new StakingLimitRemove(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  entity.save()
}

export function handleStakingLimitSet(event: StakingLimitSetEvent): void {
  let entity = new StakingLimitSet(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  entity.maxStakeLimit = event.params.maxStakeLimit
  entity.stakeLimitIncreasePerBlock = event.params.stakeLimitIncreasePerBlock
  entity.save()
}

export function handleStakingResumed(event: StakingResumed): void {
  let entity = new StakingResume(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  entity.save()
}

export function handleStakingPaused(event: StakingPaused): void {
  let entity = new StakingPause(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )
  entity.save()
}

/// lido v1 events
export {
  handleFeeDistributionSet,
  handleWithdrawalCredentialsSet,
  handleFeeSet,
  handleProtocolContractsSet,
  handleELRewardsWithdrawalLimitSet,
  handleELRewardsVaultSet,
  handleBeaconValidatorsUpdated,
  handleTestnetBlock,
  handleWithdrawal
}
