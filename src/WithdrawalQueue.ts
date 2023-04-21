import {
  // BunkerModeDisabled as BunkerModeDisabledEvent,
  // BunkerModeEnabled as BunkerModeEnabledEvent,
  // ContractVersionSet as ContractVersionSetEvent,
  // Paused as PausedEvent,
  // Resumed as ResumedEvent,
  WithdrawalClaimed as WithdrawalClaimedEvent,
  WithdrawalRequested as WithdrawalRequestedEvent,
  WithdrawalsFinalized as WithdrawalsFinalizedEvent,
  WithdrawalBatchFinalized as WithdrawalBatchFinalizedEvent
} from '../generated/WithdrawalQueue/WithdrawalQueue'
import {
  // BunkerModeDisabled,
  // BunkerModeEnabled,
  // ContractVersionSet,
  // Paused,
  // Resumed,
  WithdrawalClaimed,
  WithdrawalRequested,
  WithdrawalsFinalized
} from '../generated/schema'
import { _loadOrCreateTotalsEntity } from './helpers'

// export function handleBunkerModeDisabled(event: BunkerModeDisabledEvent): void {
//   let entity = new BunkerModeDisabled(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )

//   entity.block = event.block.number
//   entity.blockTime = event.block.timestamp
//   entity.transactionHash = event.transaction.hash
// entity.logIndex = event.logIndex

//   entity.save()
// }

// export function handleBunkerModeEnabled(event: BunkerModeEnabledEvent): void {
//   let entity = new BunkerModeEnabled(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity._sinceTimestamp = event.params._sinceTimestamp

//   entity.block = event.block.number
//   entity.blockTime = event.block.timestamp
//   entity.transactionHash = event.transaction.hash
// entity.logIndex = event.logIndex

//   entity.save()
// }

// export function handleContractVersionSet(event: ContractVersionSetEvent): void {
//   let entity = new ContractVersionSet(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.version = event.params.version

//   entity.block = event.block.number
//   entity.blockTime = event.block.timestamp
//   entity.transactionHash = event.transaction.hash
// entity.logIndex = event.logIndex

//   entity.save()
// }

// export function handlePaused(event: PausedEvent): void {
//   let entity = new Paused(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.duration = event.params.duration

//   entity.block = event.block.number
//   entity.blockTime = event.block.timestamp
//   entity.transactionHash = event.transaction.hash
// entity.logIndex = event.logIndex

//   entity.save()
// }

// export function handleResumed(event: ResumedEvent): void {
//   let entity = new Resumed(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )

//   entity.block = event.block.number
//   entity.blockTime = event.block.timestamp
//   entity.transactionHash = event.transaction.hash
// entity.logIndex = event.logIndex

//   entity.save()
// }

export function handleWithdrawalClaimed(event: WithdrawalClaimedEvent): void {
  let entity = new WithdrawalClaimed(event.transaction.hash.concatI32(event.logIndex.toI32()))
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

export function handleWithdrawalRequested(event: WithdrawalRequestedEvent): void {
  let entity = new WithdrawalRequested(event.transaction.hash.concatI32(event.logIndex.toI32()))
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

export function handleWithdrawalsFinalized(event: WithdrawalsFinalizedEvent): void {
  let entity = new WithdrawalsFinalized(event.transaction.hash.concatI32(event.logIndex.toI32()))

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

export function handleWithdrawalBatchFinalized(event: WithdrawalBatchFinalizedEvent): void {
  handleWithdrawalsFinalized(changetype<WithdrawalsFinalizedEvent>(event))
}
