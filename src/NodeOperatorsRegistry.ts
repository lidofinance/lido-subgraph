import { ethereum } from '@graphprotocol/graph-ts'
import {
  NodeOperatorStakingLimitSet as NodeOperatorStakingLimitSetEvent,
  NodeOperatorTotalStoppedValidatorsReported as NodeOperatorTotalStoppedValidatorsReportedEvent,
  NodeOperatorAdded as NodeOperatorAddedEvent,
  NodeOperatorActiveSet as NodeOperatorActiveSetEvent,
  NodeOperatorNameSet as NodeOperatorNameSetEvent,
  NodeOperatorRewardAddressSet as NodeOperatorRewardAddressSetEvent,
  SigningKeyAdded as SigningKeyAddedEvent,
  SigningKeyRemoved as SigningKeyRemovedEvent,
  NodeOperatorTotalKeysTrimmed as NodeOperatorTotalKeysTrimmedEvent,
  KeysOpIndexSet as KeysOpIndexSetEvent
} from '../generated/NodeOperatorsRegistry/NodeOperatorsRegistry'
import { NodeOperatorSigningKey, NodeOperator, NodeOperatorKeysOpIndex } from '../generated/schema'
import { ZERO, ZERO_ADDRESS } from './constants'

export function handleSigningKeyAdded(event: SigningKeyAddedEvent): void {
  const noEntity = _loadOperator(event.params.operatorId.toString())!
  const entity = new NodeOperatorSigningKey(event.params.pubkey)

  entity.operatorId = event.params.operatorId
  entity.operator = noEntity.id
  entity.pubkey = event.params.pubkey
  entity.removed = false
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex
  entity.save()
}

export function handleSigningKeyRemoved(event: SigningKeyRemovedEvent): void {
  const noEntity = _loadOperator(event.params.operatorId.toString())!
  let entity = NodeOperatorSigningKey.load(event.params.pubkey)

  if (entity == null) {
    entity = new NodeOperatorSigningKey(event.params.pubkey)
    entity.operatorId = event.params.operatorId
    entity.operator = noEntity.id
    entity.pubkey = event.params.pubkey
  }

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex

  entity.removed = true
  entity.save()
}

export function handleKeysOpIndexSet(event: KeysOpIndexSetEvent): void {
  const entity = new NodeOperatorKeysOpIndex(event.transaction.hash.concatI32(event.logIndex.toI32()))
  entity.index = event.params.keysOpIndex
  // entity.block = event.block.number
  // entity.blockTime = event.block.timestamp
  // entity.transactionHash = event.transaction.hash
  // entity.logIndex = event.logIndex

  entity.save()
}

export function handleNodeOperatorAdded(event: NodeOperatorAddedEvent): void {
  const entity = _loadOperator(event.params.id.toString(), true)!
  entity.name = event.params.name
  entity.rewardAddress = event.params.rewardAddress
  entity.stakingLimit = event.params.stakingLimit
  entity.active = true

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex

  entity.save()
}

export function handleNodeOperatorActiveSet(event: NodeOperatorActiveSetEvent): void {
  const entity = _loadOperator(event.params.id.toString())!
  entity.active = event.params.active
  entity.save()
}

export function handleNodeOperatorNameSet(event: NodeOperatorNameSetEvent): void {
  const entity = _loadOperator(event.params.id.toString())!
  entity.name = event.params.name
  entity.save()
}

export function handleNodeOperatorRewardAddressSet(event: NodeOperatorRewardAddressSetEvent): void {
  const entity = _loadOperator(event.params.id.toString())!
  entity.rewardAddress = event.params.rewardAddress
  entity.save()
}

export function handleNodeOperatorTotalKeysTrimmed(event: NodeOperatorTotalKeysTrimmedEvent): void {
  const entity = _loadOperator(event.params.id.toString())!
  entity.totalKeysTrimmed = event.params.totalKeysTrimmed
  entity.save()
}

export function handleNodeOperatorStakingLimitSet(event: NodeOperatorStakingLimitSetEvent): void {
  const entity = _loadOperator(event.params.id.toString())!
  entity.stakingLimit = event.params.stakingLimit
  entity.save()
}

export function handleNodeOperatorTotalStoppedValidatorsReported(
  event: NodeOperatorTotalStoppedValidatorsReportedEvent
): void {
  const entity = _loadOperator(event.params.id.toString())!
  entity.totalStoppedValidators = event.params.totalStopped
  entity.save()
}

function _loadOperator(id: string, create: bool = false): NodeOperator | null {
  let entity = NodeOperator.load(id)
  if (!entity && create) {
    entity = new NodeOperator(id)

    entity.name = ''
    entity.rewardAddress = ZERO_ADDRESS
    entity.stakingLimit = ZERO
    entity.active = true

    entity.totalStoppedValidators = ZERO
    entity.totalKeysTrimmed = ZERO
    entity.nonce = ZERO
  }
  return entity
}
