import {
  NodeOperatorAdded,
  NodeOperatorActiveSet,
  NodeOperatorNameSet,
  NodeOperatorRewardAddressSet,
  NodeOperatorStakingLimitSet,
  NodeOperatorTotalStoppedValidatorsReported,
  SigningKeyAdded,
  SigningKeyRemoved,
} from '../generated/NodeOperatorsRegistry/NodeOperatorsRegistry'
import { NodeOperatorSigningKey, NodeOperator } from '../generated/schema'

export function handleSigningKeyAdded(event: SigningKeyAdded): void {
  let entity = new NodeOperatorSigningKey(event.params.pubkey.toHexString())

  entity.operatorId = event.params.operatorId
  entity.pubkey = event.params.pubkey
  entity.removed = false

  entity.operator = event.params.operatorId.toString()

  entity.save()
}

export function handleSigningKeyRemoved(event: SigningKeyRemoved): void {
  let entity = NodeOperatorSigningKey.load(event.params.pubkey.toHexString())

  if (entity == null) {
    entity = new NodeOperatorSigningKey(event.params.pubkey.toHexString())
    entity.pubkey = event.params.pubkey
  }

  entity.removed = true
  entity.save()
}

export function handleNodeOperatorAdded(event: NodeOperatorAdded): void {
  let entity = new NodeOperator(event.params.id.toString())

  entity.name = event.params.name
  entity.rewardAddress = event.params.rewardAddress
  entity.stakingLimit = event.params.stakingLimit
  entity.active = true

  entity.save()
}

export function handleNodeOperatorActiveSet(
  event: NodeOperatorActiveSet
): void {
  let entity = NodeOperator.load(event.params.id.toString())

  if (entity == null) {
    entity = new NodeOperator(event.params.id.toString())
  }

  entity.active = event.params.active

  entity.save()
}

export function handleNodeOperatorNameSet(event: NodeOperatorNameSet): void {
  let entity = NodeOperator.load(event.params.id.toString())

  if (entity == null) {
    entity = new NodeOperator(event.params.id.toString())
  }

  entity.name = event.params.name

  entity.save()
}

export function handleNodeOperatorRewardAddressSet(
  event: NodeOperatorRewardAddressSet
): void {
  let entity = NodeOperator.load(event.params.id.toString())

  if (entity == null) {
    entity = new NodeOperator(event.params.id.toString())
  }

  entity.rewardAddress = event.params.rewardAddress

  entity.save()
}

export function handleNodeOperatorStakingLimitSet(
  event: NodeOperatorStakingLimitSet
): void {
  let entity = NodeOperator.load(event.params.id.toString())

  if (entity == null) {
    entity = new NodeOperator(event.params.id.toString())
  }

  entity.stakingLimit = event.params.stakingLimit

  entity.save()
}

export function handleNodeOperatorTotalStoppedValidatorsReported(
  event: NodeOperatorTotalStoppedValidatorsReported
): void {
  let entity = NodeOperator.load(event.params.id.toString())

  if (entity == null) {
    entity = new NodeOperator(event.params.id.toString())
  }

  entity.totalStoppedValidators = event.params.totalStopped

  entity.save()
}
