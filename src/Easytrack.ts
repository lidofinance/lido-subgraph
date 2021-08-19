import { BigInt, Bytes } from "@graphprotocol/graph-ts"
import {
  Easytrack,
  AdminChanged,
  BeaconUpgraded,
  Upgraded,
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
} from "../generated/Easytrack/Easytrack"

const EASYTRACK_ADDRESS = '0xb8ADb098a1B729e5fBC09291977044DEF766146c'

import { Motion, Role, EVMScriptFactory, Objection, EasyTrackConfig } from "../generated/schema"

export function handleUpgraded(event: Upgraded): void {
  let entity = EasyTrackConfig.load(EASYTRACK_ADDRESS)
  if (!entity) entity = new EasyTrackConfig(EASYTRACK_ADDRESS)

  entity.implementation = event.params.implementation
  entity.admin = new Bytes(0)
  entity.evmScriptExecutor = new Bytes(0)
  entity.motionDuration = new BigInt(0)
  entity.motionsCountLimit = new BigInt(0)
  entity.objectionsThreshold = new BigInt(0)
  entity.isPaused = false

  entity.save()
}


export function handleAdminChanged(event: AdminChanged): void {
  let entity = EasyTrackConfig.load(EASYTRACK_ADDRESS)

  entity.admin = event.params.newAdmin

  entity.save()
}


export function handleEVMScriptExecutorChanged(event: EVMScriptExecutorChanged): void {
  let entity = EasyTrackConfig.load(EASYTRACK_ADDRESS)

  entity.evmScriptExecutor = event.params._evmScriptExecutor

  entity.save()
}


export function handleMotionDurationChanged(event: MotionDurationChanged): void {
  let entity = EasyTrackConfig.load(EASYTRACK_ADDRESS)

  entity.motionDuration = event.params._motionDuration

  entity.save()
}


export function handleMotionsCountLimitChanged(event: MotionsCountLimitChanged): void {
  let entity = EasyTrackConfig.load(EASYTRACK_ADDRESS)

  entity.motionsCountLimit = event.params._newMotionsCountLimit

  entity.save()
}


export function handleObjectionsThresholdChanged(event: ObjectionsThresholdChanged): void {
  let entity = EasyTrackConfig.load(EASYTRACK_ADDRESS)

  entity.objectionsThreshold = event.params._newThreshold

  entity.save()
}


export function handlePaused(event: Paused): void {
  let entity = EasyTrackConfig.load(EASYTRACK_ADDRESS)

  entity.isPaused = true

  entity.save()
}


export function handleUnpaused(event: Unpaused): void {
  let entity = EasyTrackConfig.load(EASYTRACK_ADDRESS)

  entity.isPaused = false

  entity.save()
}


export function handleRoleAdminChanged(event: RoleAdminChanged): void {}
export function handleBeaconUpgraded(event: BeaconUpgraded): void {}


export function handleEVMScriptFactoryAdded(event: EVMScriptFactoryAdded): void {
  let entity = new EVMScriptFactory(event.params._evmScriptFactory.toHex())

  entity.address = event.params._evmScriptFactory
  entity.permissions = event.params._permissions
  entity.isActive = true

  entity.save()
}


export function handleEVMScriptFactoryRemoved(event: EVMScriptFactoryRemoved): void {
  let entity = EVMScriptFactory.load(event.params._evmScriptFactory.toHex())

  entity.isActive = false

  entity.save()
}


export function handleMotionCreated(event: MotionCreated): void {
  let entity = new Motion(event.params._motionId.toString())

  let config = EasyTrackConfig.load(EASYTRACK_ADDRESS)

  entity.snapshotBlock = event.block.number
  entity.startDate = event.block.timestamp

  entity.creator = event.params._creator
  entity.duration = config.motionDuration
  entity.evmScriptHash = event.params._evmScript
  entity.evmScriptFactory = event.params._evmScriptFactory
  entity.objectionsAmountPct = new BigInt(0)
  entity.objectionsThreshold = config.objectionsThreshold
  entity.objectionsAmount = new BigInt(0)
  entity.evmScriptCalldata = event.params._evmScriptCallData
  entity.status = 'ACTIVE'

  entity.save()
}


export function handleMotionObjected(event: MotionObjected): void {
  let entity = Motion.load(event.params._motionId.toString())

  entity.objectionsAmount = event.params._newObjectionsAmount
  entity.objectionsAmountPct = event.params._newObjectionsAmountPct

  entity.save()

  let objectionEntity = new Objection(event.params._motionId.toHex() + '-' + event.params._objector.toHex())

  objectionEntity.objector = event.params._objector
  objectionEntity.motionId = event.params._motionId
  objectionEntity.weight = event.params._weight
  objectionEntity.block = event.block.number
  objectionEntity.blockTime = event.block.timestamp

  objectionEntity.save()
}


export function handleMotionCanceled(event: MotionCanceled): void {
  let entity = new Motion(event.params._motionId.toString())

  entity.status = 'CANCELED'
  entity.canceled_at = event.block.timestamp

  entity.save()
}


export function handleMotionEnacted(event: MotionEnacted): void {
  let entity = new Motion(event.params._motionId.toString())

  entity.status = 'ENACTED'
  entity.enacted_at = event.block.timestamp

  entity.save()
}


export function handleMotionRejected(event: MotionRejected): void {
  let entity = new Motion(event.params._motionId.toString())

  entity.status = 'REJECTED'
  entity.rejected_at = event.block.timestamp

  entity.save()
}

export function handleRoleGranted(event: RoleGranted): void {
  let entity = new Role(event.params.account.toHex() + '-' + event.params.role.toHex())

  entity.role = event.params.role
  entity.address = event.params.account
  entity.creator = event.params.sender
  entity.isActive = true

  entity.save()
}


export function handleRoleRevoked(event: RoleRevoked): void {
  let entity = Role.load(event.params.account.toHex() + '-' + event.params.role.toHex())

  entity.isActive = false

  entity.save()
}
