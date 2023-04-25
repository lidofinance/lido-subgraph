import { Bytes, ethereum } from '@graphprotocol/graph-ts'
import {
  EVMScriptExecutorChanged as EVMScriptExecutorChangedEvent,
  EVMScriptFactoryAdded as EVMScriptFactoryAddedEvent,
  EVMScriptFactoryRemoved as EVMScriptFactoryRemovedEvent,
  MotionCanceled as MotionCanceledEvent,
  MotionCreated as MotionCreatedEvent,
  MotionDurationChanged as MotionDurationChangedEvent,
  MotionEnacted as MotionEnactedEvent,
  MotionObjected as MotionObjectedEvent,
  MotionRejected as MotionRejectedEvent,
  MotionsCountLimitChanged as MotionsCountLimitChangedEvent,
  ObjectionsThresholdChanged as ObjectionsThresholdChangedEvent,
  Paused as PausedEvent,
  Unpaused as UnpausedEvent,
  RoleAdminChanged as RoleAdminChangedEvent,
  RoleGranted as RoleGrantedEvent,
  RoleRevoked as RoleRevokedEvent
} from '../generated/EasyTrack/EasyTrack'

import { Motion, Role, EVMScriptFactory, Objection, EasyTrackConfig } from '../generated/schema'
import { ZERO, ZERO_ADDRESS } from './constants'

export function handleMotionCreated(event: MotionCreatedEvent): void {
  const entity = new Motion(event.params._motionId.toString())

  let config = _loadETConfig()

  entity.snapshotBlock = event.block.number
  entity.startDate = event.block.timestamp

  entity.creator = event.params._creator
  entity.duration = config.motionDuration
  entity.evmScriptHash = event.params._evmScript
  entity.evmScriptFactory = event.params._evmScriptFactory
  entity.objectionsAmountPct = ZERO
  entity.objectionsThreshold = config.objectionsThreshold
  entity.objectionsAmount = ZERO
  entity.evmScriptCalldata = event.params._evmScriptCallData
  entity.status = 'ACTIVE'

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex

  entity.save()
}

export function handleMotionObjected(event: MotionObjectedEvent): void {
  const entity = Motion.load(event.params._motionId.toString())!

  entity.objectionsAmount = event.params._newObjectionsAmount
  entity.objectionsAmountPct = event.params._newObjectionsAmountPct

  entity.save()

  const objectionEntity = new Objection(event.params._objector.concatI32(event.params._motionId.toI32()))

  objectionEntity.objector = event.params._objector
  objectionEntity.motionId = event.params._motionId
  objectionEntity.weight = event.params._weight

  objectionEntity.motion = entity.id

  objectionEntity.block = event.block.number
  objectionEntity.blockTime = event.block.timestamp
  objectionEntity.transactionHash = event.transaction.hash
  objectionEntity.logIndex = event.logIndex

  objectionEntity.save()
}

export function handleMotionCanceled(event: MotionCanceledEvent): void {
  const entity = Motion.load(event.params._motionId.toString())!

  entity.status = 'CANCELED'
  entity.canceled_at = event.block.timestamp

  entity.save()
}

export function handleMotionEnacted(event: MotionEnactedEvent): void {
  const entity = Motion.load(event.params._motionId.toString())!

  entity.status = 'ENACTED'
  entity.enacted_at = event.block.timestamp

  entity.save()
}

export function handleMotionRejected(event: MotionRejectedEvent): void {
  const entity = Motion.load(event.params._motionId.toString())!

  entity.status = 'REJECTED'
  entity.rejected_at = event.block.timestamp

  entity.save()
}

export function handleEVMScriptFactoryAdded(event: EVMScriptFactoryAddedEvent): void {
  const entity = new EVMScriptFactory(event.params._evmScriptFactory)

  entity.address = event.params._evmScriptFactory
  entity.permissions = event.params._permissions
  entity.isActive = true

  entity.save()
}

export function handleEVMScriptFactoryRemoved(event: EVMScriptFactoryRemovedEvent): void {
  const entity = EVMScriptFactory.load(event.params._evmScriptFactory)!

  entity.isActive = false

  entity.save()
}

export function handleRoleGranted(event: RoleGrantedEvent): void {
  const entity = new Role(event.params.account.concat(event.params.role))

  entity.role = event.params.role
  entity.address = event.params.account
  entity.creator = event.params.sender
  entity.isActive = true

  entity.save()
}

export function handleRoleRevoked(event: RoleRevokedEvent): void {
  const entity = Role.load(event.params.account.concat(event.params.role))!

  entity.isActive = false

  entity.save()
}

export function handleEVMScriptExecutorChanged(event: EVMScriptExecutorChangedEvent): void {
  const entity = _loadETConfig()
  entity.evmScriptExecutor = event.params._evmScriptExecutor
  entity.save()
  // _saveETConfig(entity, event)
}

export function handleMotionDurationChanged(event: MotionDurationChangedEvent): void {
  const entity = _loadETConfig()
  entity.motionDuration = event.params._motionDuration
  entity.save()
  //_saveETConfig(entity, event)
}

export function handleMotionsCountLimitChanged(event: MotionsCountLimitChangedEvent): void {
  const entity = _loadETConfig()
  entity.motionsCountLimit = event.params._newMotionsCountLimit
  entity.save()
  //_saveETConfig(entity, event)
}

export function handleObjectionsThresholdChanged(event: ObjectionsThresholdChangedEvent): void {
  const entity = _loadETConfig()
  entity.objectionsThreshold = event.params._newThreshold
  entity.save()
  //_saveETConfig(entity, event)
}

export function handlePaused(event: PausedEvent): void {
  const entity = _loadETConfig()
  entity.isPaused = true
  entity.save()
  //_saveETConfig(entity, event)
}

export function handleUnpaused(event: UnpausedEvent): void {
  const entity = _loadETConfig()
  entity.isPaused = false
  entity.save()
  //_saveETConfig(entity, event)
}

export function handleRoleAdminChanged(_event: RoleAdminChangedEvent): void {}

function _loadETConfig(): EasyTrackConfig {
  let entity = EasyTrackConfig.load('')
  if (!entity) {
    entity = new EasyTrackConfig('')

    entity.evmScriptExecutor = ZERO_ADDRESS
    entity.motionDuration = ZERO
    entity.motionsCountLimit = ZERO
    entity.objectionsThreshold = ZERO
    entity.isPaused = false
  }
  return entity
}

// function _saveETConfig(entity: EasyTrackConfig, event: ethereum.Event): void {
//   entity.block = event.block.number
//   entity.blockTime = event.block.timestamp
//   entity.transactionHash = event.transaction.hash
//   entity.logIndex = event.logIndex
//   entity.save()
// }
