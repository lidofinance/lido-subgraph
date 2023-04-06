import {
  ethereum,
  store,
  Address,
  BigInt,
  Bytes,
  Value,
  BigDecimal
} from '@graphprotocol/graph-ts'
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
  TotalReward,
  NodeOperatorFees,
  Totals,
  NodeOperatorsShares,
  Shares,
  StakingLimitRemove,
  StakingLimitSet,
  StakingResume,
  StakingPause,
  SharesTransfer,
  SharesBurn,
  Settings
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
  handleSubmit as handleSubmit_v1,
  handleTransfer as handleTransfer_v1,
  handleSharesBurnt as handleSharesBurnt_v1
} from './v1/Lido'

import { loadLidoContract, loadNORContract } from './contracts'
import { E27_PRECISION_BASE, isLidoV2Upgrade } from './constants'

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
  _updateTransferShares
} from './helpers'

export function handleETHDistributed(event: ETHDistributed): void {
  // skip direct handling due to event will be processed as part of handleTokenRebase
  // event.params.preCLBalance
  // event.params.postCLBalance
  // event.params.postBufferedEther
  // event.params.withdrawalsWithdrawn
  // event.params.executionLayerRewardsWithdrawn
}

export function handleTokenRebase(event: TokenRebased): void {
  let totals = _loadOrCreateTotalsEntity()
  let totalRewardsEntity = _loadOrCreateTotalRewardEntity(event)

  // totalRewardsEntity.feeBasis = currentFees.feeBasisPoints!
  // totalRewardsEntity.treasuryFeeBasisPoints =
  //   currentFees.treasuryFeeBasisPoints!
  // totalRewardsEntity.insuranceFeeBasisPoints =
  //   currentFees.insuranceFeeBasisPoints!
  // totalRewardsEntity.operatorsFeeBasisPoints =
  //   currentFees.operatorsFeeBasisPoints!

  totalRewardsEntity.totalPooledEtherBefore = totals.totalPooledEther
  totalRewardsEntity.totalSharesBefore = totals.totalShares

  totals.totalPooledEther = event.params.postTotalEther
  totals.totalShares = event.params.postTotalShares
  totals.save()

  totalRewardsEntity.totalPooledEtherAfter = totals.totalPooledEther
  totalRewardsEntity.totalSharesAfter = totals.totalShares

  totalRewardsEntity.totalRewardsWithFees = totalRewardsEntity.totalPooledEtherAfter.minus(
    totalRewardsEntity.totalPooledEtherBefore
  )
  totalRewardsEntity.totalRewards = totalRewardsEntity.totalRewardsWithFees

  totalRewardsEntity.shares2mint = event.params.sharesMintedAsFees
  // there is no insurance fund anymore
  totalRewardsEntity.sharesToInsuranceFund = ZERO

  // parse all events from tx receipt
  const parsedEvents = parseEventLogs(event)

  // find ETHDistributed logIndex
  const ethDistributedEvent = findParsedEventByName(
    parsedEvents,
    'ETHDistributed'
  )
  if (!ethDistributedEvent) {
    throw new Error('EVENT NOT FOUND: ethDistributedEvent')
  }

  // extracting only 'Transfer' and 'TransferShares' pairs between ETHDistributed to TokenRebased
  // assuming the ETHDistributed and TokenRebased events are presents in tx only once
  const transferEvents = extractPairedEvent(
    filterParsedEventsByLogIndexRange(
      parsedEvents,
      ethDistributedEvent.event.logIndex,
      event.logIndex
    ),
    ['Transfer', 'TransferShares']
  )

  let sharesToTreasury = ZERO
  let sharesToOperators = ZERO

  for (let i = 0; i < transferEvents.length; i++) {
    let lidoTransferEntity = _loadOrCreateLidoTransferEntity(
      changetype<Transfer>(transferEvents[i][0].event),
      changetype<TransferShares>(transferEvents[i][1].event)
    )
    // process only mint events
    if (lidoTransferEntity.from == ZERO_ADDRESS) {
      if (lidoTransferEntity.to == getAddress('Treasury')) {
        sharesToTreasury = sharesToTreasury.plus(lidoTransferEntity.shares)
      } else {
        sharesToOperators = sharesToOperators.plus(lidoTransferEntity.shares)
      }
      lidoTransferEntity.mintWithoutSubmission = true
      lidoTransferEntity.totalPooledEther = totals.totalPooledEther
      lidoTransferEntity.totalShares = totals.totalShares
      // upd account's shares and stats
      _updateTransferShares(lidoTransferEntity)
      _updateHolders(lidoTransferEntity)
      lidoTransferEntity.save()
    }
  }

  totalRewardsEntity.sharesToOperators = sharesToOperators
  totalRewardsEntity.sharesToTreasury = sharesToTreasury

  // assert(
  //   sharesToOperators == event.params.sharesMintedAsFees.minus(sharesToTreasury)
  // )

  // todo
  // totalRewardsEntity.mevFee ?
  // totalRewardsEntity.dustSharesToTreasury ?

  // APR
  totalRewardsEntity.preTotalPooledEther = event.params.preTotalEther
  totalRewardsEntity.postTotalPooledEther = event.params.postTotalEther
  totalRewardsEntity.timeElapsed = event.params.timeElapsed
  totalRewardsEntity.totalShares = event.params.postTotalShares

  let preShareRate = event.params.preTotalEther
    .toBigDecimal()
    .times(E27_PRECISION_BASE)
    .div(event.params.preTotalShares.toBigDecimal())
  let postShareRate = event.params.postTotalEther
    .toBigDecimal()
    .times(E27_PRECISION_BASE)
    .div(event.params.postTotalShares.toBigDecimal())
  let secondsInYear = BigInt.fromI32(60 * 60 * 24 * 365).toBigDecimal()

  let apr = secondsInYear
    .times(postShareRate.minus(preShareRate))
    .div(preShareRate)
    .div(event.params.timeElapsed.toBigDecimal())
  totalRewardsEntity.apr = apr
}

export function handleTransfer(event: Transfer): void {
  if (!isLidoV2Upgrade(event)) {
    return handleTransfer_v1(event)
  }

  const id = event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  let entity = LidoTransfer.load(id)
  if (entity) {
    // if entity exists, assuming it was created just before during handling Submit or Oracle report events
    return
  }

  // entity = _loadOrCreateLidoTransfer(eventTransfer, eventTransferShares)

  entity = new LidoTransfer(id)
  entity.from = event.params.from
  entity.to = event.params.to
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.transactionIndex = event.transaction.index
  entity.logIndex = event.logIndex
  entity.transactionLogIndex = event.transactionLogIndex
  entity.value = event.params.value

  // now we should parse the whole tx receipt to be sure pair extraction is accurate
  const parsedEvents = parseEventLogs(event)
  // extracting only 'Transfer' and 'TransferShares' pairs and find the item which contains current event
  // const transferEvents = filterPairedEventsByLogIndex(
  //   extractPairedEvent(parsedEvents, ['Transfer', 'TransferShares']),
  //   event.logIndex
  // )
  const transferEvent = findPairedEventByLogIndex(
    extractPairedEvent(parsedEvents, ['Transfer', 'TransferShares']),
    event.logIndex
  )
  // @todo check if found
  if (!transferEvent) {
    if (!transferEvent) {
      throw new Error('EVENT PAIR NOT FOUND: Transfer/TransferShares')
    }
  }

  let eventTransferShares = changetype<TransferShares>(transferEvent[1].event)

  entity.shares = eventTransferShares.params.sharesValue

  // entity.mintWithoutSubmission = false

  // Totals entity should be already created at this point
  let totals = _loadOrCreateTotalsEntity()
  entity.totalPooledEther = totals.totalPooledEther
  entity.totalShares = totals.totalShares

  // upd account's shares and stats
  _updateTransferShares(entity)
  // update holders
  _updateHolders(entity)

  entity.save()
}

export function handleSubmit(event: Submitted): void {
  if (!isLidoV2Upgrade(event)) {
    return handleSubmit_v1(event)
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

  // Expecting that Transfer should be after Submission but no later than two log events after it
  const maxTransferEventLogIndexOffset = BigInt.fromI32(2)
  const parsedEvents = parseEventLogs(
    event,
    event.logIndex,
    event.logIndex.plus(maxTransferEventLogIndexOffset)
  )
  // extracting only 'Transfer' and 'TransferShares' pairs
  const transferEvents = extractPairedEvent(parsedEvents, [
    'Transfer',
    'TransferShares'
  ])

  let eventTransfer: Transfer
  let eventTransferShares: TransferShares
  let lidoTransferEntity: LidoTransfer

  // expecting only one Transfer events pair
  if (transferEvents.length > 0) {
    lidoTransferEntity = _loadOrCreateLidoTransferEntity(
      changetype<Transfer>(transferEvents[0][0].event),
      changetype<TransferShares>(transferEvents[0][1].event)
    )
    // eventTransfer = changetype<Transfer>(transferEvents[0][0].event)
    // eventTransferShares = changetype<TransferShares>(transferEvents[0][1].event)
    // lidoTransferEntity = _loadOrCreateLidoTransfer(eventTransfer, eventTransferShares)

    // lidoTransferEntity = new LidoTransfer(
    //   eventTransfer.transaction.hash.toHex() +
    //     '-' +
    //     eventTransfer.logIndex.toString()
    // )
    // lidoTransferEntity.from = eventTransfer.params.from
    // lidoTransferEntity.to = eventTransfer.params.to
    // lidoTransferEntity.block = eventTransfer.block.number
    // lidoTransferEntity.blockTime = eventTransfer.block.timestamp
    // lidoTransferEntity.transactionHash = eventTransfer.transaction.hash
    // lidoTransferEntity.transactionIndex = eventTransfer.transaction.index
    // lidoTransferEntity.logIndex = eventTransfer.logIndex
    // lidoTransferEntity.transactionLogIndex = eventTransfer.transactionLogIndex
    // lidoTransferEntity.value = eventTransfer.params.value
    // lidoTransferEntity.shares = eventTransferShares.params.sharesValue
  } else {
    // @todo throw error?
    // first submission without Transfer event! shares = amount
    lidoTransferEntity = new LidoTransfer(
      event.transaction.hash.toHex() + '-' + event.logIndex.toString()
    )
    lidoTransferEntity.from = ZERO_ADDRESS
    lidoTransferEntity.to = event.params.sender
    lidoTransferEntity.block = event.block.number
    lidoTransferEntity.blockTime = event.block.timestamp
    lidoTransferEntity.transactionHash = event.transaction.hash
    lidoTransferEntity.transactionIndex = event.transaction.index
    lidoTransferEntity.logIndex = event.logIndex
    lidoTransferEntity.transactionLogIndex = event.transactionLogIndex
    lidoTransferEntity.value = event.params.amount
    lidoTransferEntity.shares = event.params.amount
  }

  lidoTransferEntity.mintWithoutSubmission = false

  /**
   Use 1:1 ether-shares ratio when:
   1. Nothing was staked yet
   2. Someone staked something, but shares got rounded to 0 eg staking 1 wei
  **/
  // entity.shares = totals.totalPooledEther.isZero()
  //   ? event.params.amount
  //   : lidoTransferEntity.shares

  entity.shares = lidoTransferEntity.shares

  // Loading totals
  let totals = _loadOrCreateTotalsEntity()
  entity.totalPooledEtherBefore = totals.totalPooledEther
  entity.totalSharesBefore = totals.totalShares

  // Increasing address shares
  let sharesEntity = _loadOrCreateSharesEntity(event.params.sender)
  entity.sharesBefore = sharesEntity.shares

  // Increasing Totals
  totals.totalPooledEther = totals.totalPooledEther.plus(event.params.amount)
  totals.totalShares = totals.totalShares.plus(entity.shares)

  lidoTransferEntity.totalPooledEther = totals.totalPooledEther
  lidoTransferEntity.totalShares = totals.totalShares
  // upd account's shares and stats
  _updateTransferShares(lidoTransferEntity)
  _updateHolders(lidoTransferEntity)

  // sharesEntity.shares = sharesEntity.shares.plus(entity.shares)
  sharesEntity = _loadOrCreateSharesEntity(event.params.sender)
  entity.sharesAfter = sharesEntity.shares

  // assert(entity.shares = entity.sharesAfter.minus( entity.sharesBefore))

  entity.totalPooledEtherAfter = totals.totalPooledEther
  entity.totalSharesAfter = totals.totalShares

  /// @todo change to .plus(lidoTransferEntity.value) ?
  // Calculating new balance
  entity.balanceAfter = entity.sharesAfter
    .times(entity.totalPooledEtherAfter)
    .div(entity.totalSharesAfter)

  lidoTransferEntity.save()
  entity.save()
  totals.save()
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
  if (!isLidoV2Upgrade(event)) {
    return handleSharesBurnt_v1(event)
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

  let shares = _loadOrCreateSharesEntity(event.params.account)
  shares.shares = shares.shares.minus(event.params.sharesAmount)
  shares.save()

  // skip totals processing in favor of the handleTokenRebase method
}

export function handleELRewardsReceived(event: ELRewardsReceived): void {
  if (!isLidoV2Upgrade(event)) {
    return handleELRewardsReceived_v1(event)
  }
  // else skip in favor of the handleTokenRebase method
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
