import {
  BunkerModeDisabled as BunkerModeDisabledEvent,
  BunkerModeEnabled as BunkerModeEnabledEvent,
  ContractVersionSet as ContractVersionSetEvent,
  Paused as PausedEvent,
  Resumed as ResumedEvent,
  WithdrawalClaimed as WithdrawalClaimedEvent,
  WithdrawalRequested as WithdrawalRequestedEvent,
  WithdrawalsFinalized as WithdrawalsFinalizedEvent,
  WithdrawalBatchFinalized as WithdrawalBatchFinalizedEvent
} from '../generated/WithdrawalQueue/WithdrawalQueue'
import {
  WithdrawalClaimed,
  WithdrawalQueueConfig,
  WithdrawalRequested,
  WithdrawalsFinalized
} from '../generated/schema'
import { ZERO } from './constants'

export function handleWithdrawalClaimed(event: WithdrawalClaimedEvent): void {
  let entity = new WithdrawalClaimed(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.requestId = event.params.requestId
  entity.owner = event.params.owner
  entity.receiver = event.params.receiver
  entity.amountOfETH = event.params.amountOfETH

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex

  entity.save()
}

export function handleWithdrawalRequested(
  event: WithdrawalRequestedEvent
): void {
  let entity = new WithdrawalRequested(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.requestId = event.params.requestId
  entity.requestor = event.params.requestor
  entity.owner = event.params.owner
  entity.amountOfStETH = event.params.amountOfStETH
  entity.amountOfShares = event.params.amountOfShares

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex

  entity.save()
}

export function handleWithdrawalsFinalized(
  event: WithdrawalsFinalizedEvent
): void {
  let entity = new WithdrawalsFinalized(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )

  entity.from = event.params.from
  entity.to = event.params.to
  entity.amountOfETHLocked = event.params.amountOfETHLocked
  entity.sharesToBurn = event.params.sharesToBurn
  entity.timestamp = event.params.timestamp

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex

  entity.save()
}

export function handleWithdrawalBatchFinalized(
  event: WithdrawalBatchFinalizedEvent
): void {
  handleWithdrawalsFinalized(changetype<WithdrawalsFinalizedEvent>(event))
}

export function handleBunkerModeDisabled(event: BunkerModeDisabledEvent): void {
  const entity = _loadWQConfig()
  entity.isBunkerMode = false
  entity.bunkerModeSince = ZERO
  entity.save()
}

export function handleBunkerModeEnabled(event: BunkerModeEnabledEvent): void {
  const entity = _loadWQConfig()
  entity.isBunkerMode = true
  entity.bunkerModeSince = event.params._sinceTimestamp
  entity.save()
}

export function handleContractVersionSet(event: ContractVersionSetEvent): void {
  const entity = _loadWQConfig()
  entity.contractVersion = event.params.version
  entity.save()
}

export function handlePaused(event: PausedEvent): void {
  const entity = _loadWQConfig()
  entity.isPaused = true
  entity.pauseDuration = event.params.duration
  entity.save()
}

export function handleResumed(event: ResumedEvent): void {
  const entity = _loadWQConfig()
  entity.isPaused = false
  entity.pauseDuration = ZERO
  entity.save()
}

function _loadWQConfig(): WithdrawalQueueConfig {
  let entity = WithdrawalQueueConfig.load('')
  if (!entity) {
    entity = new WithdrawalQueueConfig('')

    entity.isBunkerMode = false
    entity.bunkerModeSince = ZERO
    entity.contractVersion = ZERO
    entity.isPaused = true
    entity.pauseDuration = ZERO
  }
  return entity
}
