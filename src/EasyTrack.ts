import { Bytes, ethereum } from '@graphprotocol/graph-ts'
import {
  EVMScriptExecutorChanged,
  EVMScriptFactoryAdded,
  EVMScriptFactoryRemoved,
  MotionCanceled,
  MotionCreated,
  MotionDurationChanged,
  MotionEnacted,
  MotionObjected,
  MotionRejected,
  MotionsCountLimitChanged,
  ObjectionsThresholdChanged,
  Paused,
  Unpaused,
  RoleAdminChanged,
  RoleGranted,
  RoleRevoked
} from '../generated/EasyTrack/EasyTrack'

import { Motion, Role, EVMScriptFactory, Objection, EasyTrackConfig } from '../generated/schema'
import { ZERO, ZERO_ADDRESS } from './constants'

function _loadConfig(): EasyTrackConfig {
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

function _saveConfig(entity: EasyTrackConfig, event: ethereum.Event): void {
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex
  entity.save()
}

export function handleEVMScriptExecutorChanged(event: EVMScriptExecutorChanged): void {
  const entity = _loadConfig()
  entity.evmScriptExecutor = event.params._evmScriptExecutor
  _saveConfig(entity, event)
}

export function handleMotionDurationChanged(event: MotionDurationChanged): void {
  const entity = _loadConfig()
  entity.motionDuration = event.params._motionDuration
  _saveConfig(entity, event)
}

export function handleMotionsCountLimitChanged(event: MotionsCountLimitChanged): void {
  const entity = _loadConfig()
  entity.motionsCountLimit = event.params._newMotionsCountLimit
  _saveConfig(entity, event)
}

export function handleObjectionsThresholdChanged(event: ObjectionsThresholdChanged): void {
  const entity = _loadConfig()
  entity.objectionsThreshold = event.params._newThreshold
  _saveConfig(entity, event)
}

export function handlePaused(event: Paused): void {
  const entity = _loadConfig()
  entity.isPaused = true
  _saveConfig(entity, event)
}

export function handleUnpaused(event: Unpaused): void {
  const entity = _loadConfig()
  entity.isPaused = false
  _saveConfig(entity, event)
}

export function handleRoleAdminChanged(_event: RoleAdminChanged): void {}

export function handleEVMScriptFactoryAdded(event: EVMScriptFactoryAdded): void {
  const entity = new EVMScriptFactory(event.params._evmScriptFactory)

  entity.address = event.params._evmScriptFactory
  entity.permissions = event.params._permissions
  entity.isActive = true

  entity.save()
}

export function handleEVMScriptFactoryRemoved(event: EVMScriptFactoryRemoved): void {
  const entity = EVMScriptFactory.load(event.params._evmScriptFactory)!

  entity.isActive = false

  entity.save()
}

export function handleMotionCreated(event: MotionCreated): void {
  const entity = new Motion(event.params._motionId.toString())

  let config = _loadConfig()

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

export function handleMotionObjected(event: MotionObjected): void {
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

export function handleMotionCanceled(event: MotionCanceled): void {
  const entity = Motion.load(event.params._motionId.toString())!

  entity.status = 'CANCELED'
  entity.canceled_at = event.block.timestamp

  entity.save()
}

export function handleMotionEnacted(event: MotionEnacted): void {
  const entity = Motion.load(event.params._motionId.toString())!

  entity.status = 'ENACTED'
  entity.enacted_at = event.block.timestamp

  entity.save()
}

export function handleMotionRejected(event: MotionRejected): void {
  const entity = Motion.load(event.params._motionId.toString())!

  entity.status = 'REJECTED'
  entity.rejected_at = event.block.timestamp

  entity.save()
}

export function handleRoleGranted(event: RoleGranted): void {
  const entity = new Role(event.params.account.concat(event.params.role))

  entity.role = event.params.role
  entity.address = event.params.account
  entity.creator = event.params.sender
  entity.isActive = true

  entity.save()
}

export function handleRoleRevoked(event: RoleRevoked): void {
  const entity = Role.load(event.params.account.concat(event.params.role))!

  entity.isActive = false

  entity.save()
}
