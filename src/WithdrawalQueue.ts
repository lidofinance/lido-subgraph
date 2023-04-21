import {
  // Approval as ApprovalEvent,
  // ApprovalForAll as ApprovalForAllEvent,
  // BaseURISet as BaseURISetEvent,
  // BunkerModeDisabled as BunkerModeDisabledEvent,
  // BunkerModeEnabled as BunkerModeEnabledEvent,
  // ContractVersionSet as ContractVersionSetEvent,
  // InitializedV1 as InitializedV1Event,
  // NftDescriptorAddressSet as NftDescriptorAddressSetEvent,
  // Paused as PausedEvent,
  // Resumed as ResumedEvent,
  // RoleAdminChanged as RoleAdminChangedEvent,
  // RoleGranted as RoleGrantedEvent,
  // RoleRevoked as RoleRevokedEvent,
  // Transfer as TransferEvent,
  // WithdrawalClaimed as WithdrawalClaimedEvent,
  // WithdrawalRequested as WithdrawalRequestedEvent,
  WithdrawalsFinalized as WithdrawalsFinalizedEvent,
  WithdrawalBatchFinalized as WithdrawalBatchFinalizedEvent
} from "../generated/WithdrawalQueue/WithdrawalQueue"
import {
  // Approval,
  // ApprovalForAll,
  // BaseURISet,
  // BunkerModeDisabled,
  // BunkerModeEnabled,
  // ContractVersionSet,
  // InitializedV1,
  // NftDescriptorAddressSet,
  // Paused,
  // Resumed,
  // RoleAdminChanged,
  // RoleGranted,
  // RoleRevoked,
  // Transfer,
  // WithdrawalClaimed,
  // WithdrawalRequested,
  // WithdrawalsFinalized,
  // WithdrawalBatchFinalized
} from "../generated/schema"
import { _loadOrCreateTotalsEntity } from "./helpers"

export function handleWithdrawalsFinalized(
  event: WithdrawalsFinalizedEvent
): void {
  let totals = _loadOrCreateTotalsEntity()
  totals.totalPooledEther = totals.totalPooledEther.minus(event.params.amountOfETHLocked)
  totals.save()

}
export function handleWithdrawalBatchFinalized(
  event: WithdrawalBatchFinalizedEvent
): void {
  let totals = _loadOrCreateTotalsEntity()
  totals.totalPooledEther = totals.totalPooledEther.minus(event.params.amountOfETHLocked)
  totals.save()
}

// export function handleApproval(event: ApprovalEvent): void {
//   let entity = new Approval(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.owner = event.params.owner
//   entity.approved = event.params.approved
//   entity.tokenId = event.params.tokenId

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleApprovalForAll(event: ApprovalForAllEvent): void {
//   let entity = new ApprovalForAll(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.owner = event.params.owner
//   entity.operator = event.params.operator
//   entity.approved = event.params.approved

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleBaseURISet(event: BaseURISetEvent): void {
//   let entity = new BaseURISet(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.baseURI = event.params.baseURI

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleBunkerModeDisabled(event: BunkerModeDisabledEvent): void {
//   let entity = new BunkerModeDisabled(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleBunkerModeEnabled(event: BunkerModeEnabledEvent): void {
//   let entity = new BunkerModeEnabled(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity._sinceTimestamp = event.params._sinceTimestamp

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleContractVersionSet(event: ContractVersionSetEvent): void {
//   let entity = new ContractVersionSet(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.version = event.params.version

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleInitializedV1(event: InitializedV1Event): void {
//   let entity = new InitializedV1(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity._admin = event.params._admin

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleNftDescriptorAddressSet(
//   event: NftDescriptorAddressSetEvent
// ): void {
//   let entity = new NftDescriptorAddressSet(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.nftDescriptorAddress = event.params.nftDescriptorAddress

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handlePaused(event: PausedEvent): void {
//   let entity = new Paused(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.duration = event.params.duration

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleResumed(event: ResumedEvent): void {
//   let entity = new Resumed(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleRoleAdminChanged(event: RoleAdminChangedEvent): void {
//   let entity = new RoleAdminChanged(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.role = event.params.role
//   entity.previousAdminRole = event.params.previousAdminRole
//   entity.newAdminRole = event.params.newAdminRole

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleRoleGranted(event: RoleGrantedEvent): void {
//   let entity = new RoleGranted(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.role = event.params.role
//   entity.account = event.params.account
//   entity.sender = event.params.sender

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleRoleRevoked(event: RoleRevokedEvent): void {
//   let entity = new RoleRevoked(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.role = event.params.role
//   entity.account = event.params.account
//   entity.sender = event.params.sender

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleTransfer(event: TransferEvent): void {
//   let entity = new Transfer(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.from = event.params.from
//   entity.to = event.params.to
//   entity.tokenId = event.params.tokenId

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleWithdrawalClaimed(event: WithdrawalClaimedEvent): void {
//   let entity = new WithdrawalClaimed(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.requestId = event.params.requestId
//   entity.owner = event.params.owner
//   entity.receiver = event.params.receiver
//   entity.amountOfETH = event.params.amountOfETH

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }

// export function handleWithdrawalRequested(
//   event: WithdrawalRequestedEvent
// ): void {
//   let entity = new WithdrawalRequested(
//     event.transaction.hash.concatI32(event.logIndex.toI32())
//   )
//   entity.requestId = event.params.requestId
//   entity.requestor = event.params.requestor
//   entity.owner = event.params.owner
//   entity.amountOfStETH = event.params.amountOfStETH
//   entity.amountOfShares = event.params.amountOfShares

//   entity.blockNumber = event.block.number
//   entity.blockTimestamp = event.block.timestamp
//   entity.transactionHash = event.transaction.hash

//   entity.save()
// }
