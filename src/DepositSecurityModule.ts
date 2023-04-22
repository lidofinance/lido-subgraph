import { ethereum } from '@graphprotocol/graph-ts'
import {
  DepositsPaused as DepositsPausedEvent,
  DepositsUnpaused as DepositsUnpausedEvent,
  GuardianAdded as GuardianAddedEvent,
  GuardianQuorumChanged as GuardianQuorumChangedEvent,
  GuardianRemoved as GuardianRemovedEvent,
  MaxDepositsChanged as MaxDepositsChangedEvent,
  MinDepositBlockDistanceChanged as MinDepositBlockDistanceChangedEvent,
  NodeOperatorsRegistryChanged as NodeOperatorsRegistryChangedEvent,
  OwnerChanged as OwnerChangedEvent,
  PauseIntentValidityPeriodBlocksChanged as PauseIntentValidityPeriodBlocksChangedEvent
} from '../generated/DepositSecurityModule/DepositSecurityModule'

import { DepositSecurityModuleConfig, DepositsPause, Guardian } from '../generated/schema'
import { ZERO, ZERO_ADDRESS } from './constants'

export function handleDepositsPaused(event: DepositsPausedEvent): void {
  let pauseEntity = new DepositsPause(event.transaction.hash.concatI32(event.logIndex.toI32()))
  pauseEntity.guardian = event.params.guardian.toHexString()

  pauseEntity.block = event.block.number
  pauseEntity.blockTime = event.block.timestamp
  pauseEntity.transactionHash = event.block.hash
  pauseEntity.logIndex = event.logIndex
  pauseEntity.save()

  const entity = _loadDSMConfig()
  entity.paused = true
  _saveDSMConfig(entity, event)
}

export function handleDepositsUnpaused(event: DepositsUnpausedEvent): void {
  const entity = _loadDSMConfig()
  entity.paused = false
  _saveDSMConfig(entity, event)
}

export function handleGuardianAdded(event: GuardianAddedEvent): void {
  let entity = new Guardian(event.params.guardian.toHexString())

  entity.address = event.params.guardian
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.block.hash
  entity.logIndex = event.logIndex
  entity.removed = false

  entity.save()
}

export function handleGuardianQuorumChanged(event: GuardianQuorumChangedEvent): void {
  const entity = _loadDSMConfig()
  entity.guardianQuorum = event.params.newValue
  _saveDSMConfig(entity, event)
}

export function handleGuardianRemoved(event: GuardianRemovedEvent): void {
  let entity = Guardian.load(event.params.guardian.toHexString())

  // Do we have this guardian?
  if (entity) {
    entity.removed = true
    entity.save()
  }
}

export function handleMaxDepositsChanged(event: MaxDepositsChangedEvent): void {
  const entity = _loadDSMConfig()
  entity.maxDeposits = event.params.newValue
  _saveDSMConfig(entity, event)
}

export function handleMinDepositBlockDistanceChanged(event: MinDepositBlockDistanceChangedEvent): void {
  const entity = _loadDSMConfig()
  entity.minDepositBlockDistance = event.params.newValue
  _saveDSMConfig(entity, event)
}

export function handleNodeOperatorsRegistryChanged(event: NodeOperatorsRegistryChangedEvent): void {
  const entity = _loadDSMConfig()
  entity.nodeOperatorsRegistry = event.params.newValue
  _saveDSMConfig(entity, event)
}

export function handleOwnerChanged(event: OwnerChangedEvent): void {
  const entity = _loadDSMConfig()
  entity.owner = event.params.newValue
  _saveDSMConfig(entity, event)
}

export function handlePauseIntentValidityPeriodBlocksChanged(event: PauseIntentValidityPeriodBlocksChangedEvent): void {
  const entity = _loadDSMConfig()
  entity.pauseIntentValidityPeriodBlocks = event.params.newValue
  _saveDSMConfig(entity, event)
}

function _loadDSMConfig(): DepositSecurityModuleConfig {
  let entity = DepositSecurityModuleConfig.load('')
  if (!entity) {
    entity = new DepositSecurityModuleConfig('')

    entity.paused = false
    entity.guardianQuorum = ZERO
    entity.maxDeposits = ZERO
    entity.minDepositBlockDistance = ZERO
    entity.nodeOperatorsRegistry = ZERO_ADDRESS
    entity.owner = ZERO_ADDRESS
    entity.pauseIntentValidityPeriodBlocks = ZERO
  }
  return entity
}

function _saveDSMConfig(entity: DepositSecurityModuleConfig, event: ethereum.Event): void {
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex
  entity.save()
}
