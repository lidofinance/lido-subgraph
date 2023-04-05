import {
  ethereum,
  store,
  Address,
  BigInt,
  Bytes,
  Value
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
  LidoWithdrawal,
  TotalReward,
  NodeOperatorFees,
  Totals,
  NodeOperatorsShares,
  Shares,
  Holder,
  Stats,
  CurrentFees,
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

import { loadLidoContract, loadNosContract } from './contracts'
import { isLidoV2Upgrade } from './constants'

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
  _loadOrCreateSharesEntity,
  _loadOrCreateStatsEntity,
  _loadOrCreateTotalsEntity
} from './helpers'

export function handleTransferShares(event: TransferShares): void {
  // just skip direct handling due to event will be processed as part of handleTransfer
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
  const parsedEvents = parseEventLogs(
    event,
    BigInt.fromI32(0),
    BigInt.fromI32(0)
  )
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

export function handleETHDistributed(event: ETHDistributed): void {
  // just skip direct handling due to event will be processed as part of handleTokenRebase
}

export function handleTokenRebase(event: TokenRebased): void {
  // parse all events from tx receipt
  const parsedEvents = parseEventLogs(event, event.logIndex)

  // find ETHDistributed logIndex
  const ethDistributedEvent = findParsedEventByName(
    parsedEvents,
    'ETHDistributed'
  )
  if (!ethDistributedEvent) {
    throw new Error('EVENT NOT FOUND: ethDistributedEvent')
  }

  // extracting only 'Transfer' and 'TransferShares' pairs between ETHDistributed to TokenRebased
  // assuming the ETHDistributed and TokenRebased events are presented in tx only once
  const transferEvents = extractPairedEvent(
    filterParsedEventsByLogIndexRange(
      parsedEvents,
      ethDistributedEvent.event.logIndex,
      event.logIndex
    ),
    ['Transfer', 'TransferShares']
  )


  // - filter events between ETHDistributed to TokenRebased
  // - extract transfers
  // filter from=ZERO_ADDR
  // upd totalrewards before/after
  // loop transfers: calc fees
  // loop transfers: op rewards
}

export function handleSharesBurnt(event: SharesBurnt): void {
  if (!isLidoV2Upgrade(event)) {
    return handleSharesBurnt_v1(event)
  }

  let entity = new SharesBurn(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.account = event.params.account
  entity.postRebaseTokenAmount = event.params.postRebaseTokenAmount
  entity.preRebaseTokenAmount = event.params.preRebaseTokenAmount
  entity.sharesAmount = event.params.sharesAmount

  entity.save()

  // let address = event.params.account
  // let sharesAmount = event.params.sharesAmount

  let shares = _loadOrCreateSharesEntity(event.params.account)
  shares.shares = shares.shares.minus(event.params.sharesAmount)
  shares.save()

  let totals = _loadOrCreateTotalsEntity()
  totals.totalShares = totals.totalShares.minus(event.params.sharesAmount)
  totals.save()
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
    eventTransfer = changetype<Transfer>(transferEvents[0][0].event)
    eventTransferShares = changetype<TransferShares>(transferEvents[0][1].event)
    // lidoTransferEntity = _loadOrCreateLidoTransfer(eventTransfer, eventTransferShares)

    lidoTransferEntity = new LidoTransfer(
      eventTransfer.transaction.hash.toHex() +
        '-' +
        eventTransfer.logIndex.toString()
    )
    lidoTransferEntity.from = eventTransfer.params.from
    lidoTransferEntity.to = eventTransfer.params.to
    lidoTransferEntity.block = eventTransfer.block.number
    lidoTransferEntity.blockTime = eventTransfer.block.timestamp
    lidoTransferEntity.transactionHash = eventTransfer.transaction.hash
    lidoTransferEntity.transactionIndex = eventTransfer.transaction.index
    lidoTransferEntity.logIndex = eventTransfer.logIndex
    lidoTransferEntity.transactionLogIndex = eventTransfer.transactionLogIndex
    lidoTransferEntity.value = eventTransfer.params.value
    lidoTransferEntity.shares = eventTransferShares.params.sharesValue
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

function _updateTransferShares(entity: LidoTransfer): void {
  // No point in changing 0x0 shares
  if (!entity.shares.isZero()) {
    // Decreasing from address shares
    if (entity.from != ZERO_ADDRESS) {
      // Address must already have shares, HOWEVER:
      // Someone can and managed to produce events of 0 to 0 transfers
      let sharesFromEntity = _loadOrCreateSharesEntity(entity.from)

      entity.sharesBeforeDecrease = sharesFromEntity.shares
      sharesFromEntity.shares = sharesFromEntity.shares.minus(entity.shares)
      entity.sharesAfterDecrease = sharesFromEntity.shares

      sharesFromEntity.save()

      // Calculating new balance
      entity.balanceAfterDecrease = entity
        .sharesAfterDecrease!.times(entity.totalPooledEther)
        .div(entity.totalShares)
    }

    // Increasing to address shares
    if (entity.to != ZERO_ADDRESS) {
      let sharesToEntity = _loadOrCreateSharesEntity(entity.to)

      entity.sharesBeforeIncrease = sharesToEntity.shares
      sharesToEntity.shares = sharesToEntity.shares.plus(entity.shares)
      entity.sharesAfterIncrease = sharesToEntity.shares

      sharesToEntity.save()

      // Calculating new balance
      entity.balanceAfterIncrease = entity
        .sharesAfterIncrease!.times(entity.totalPooledEther)
        .div(entity.totalShares)
    }
  }
}

function _updateHolders(entity: LidoTransfer): void {
  // Saving recipient address as a unique stETH holder
  if (!entity.shares.isZero()) {
    let stats = _loadOrCreateStatsEntity()
    let isNewHolder = false
    let holder: Holder | null
    // skip zero destination for any case
    if (entity.to != ZERO_ADDRESS) {
      holder = Holder.load(entity.to)
      isNewHolder = !holder
      if (isNewHolder) {
        holder = new Holder(entity.to)
        holder.address = entity.to
        holder.save()
      }
    }

    if (isNewHolder) {
      stats.uniqueHolders = stats.uniqueHolders!.plus(ONE)
      stats.uniqueAnytimeHolders = stats.uniqueAnytimeHolders!.plus(ONE)
    } else if (
      entity.from != ZERO_ADDRESS &&
      entity.sharesAfterDecrease!.isZero()
    ) {
      // Mints don't have balanceAfterDecrease
      stats.uniqueHolders = stats.uniqueHolders!.minus(ONE)
      // delete holder
      // @todo check id correctness
      store.remove('Holder', entity.from.toString())
    }
    stats.save()
  }
}

/**
We need to recalculate total rewards when there are MEV rewards.
This event is emitted only when there was something taken from MEV vault.
Most logic is the same as in Oracle's handleCompleted.

TODO: We should not skip TotalReward creation when there are no basic rewards but there are MEV rewards.

Usual order of events:
BeaconReported -> Completed -> ELRewardsReceived

Accounting for ELRewardsReceived before Completed too for edge cases.
**/
export function handleELRewardsReceived(event: ELRewardsReceived): void {
  if (!isLidoV2Upgrade(event)) {
    return handleELRewardsReceived_v1(event)
  }
  // else skip in favor of the handleTokenRebase
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
