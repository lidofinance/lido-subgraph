import {
  NodeOperatorStakingLimitSet,
  NodeOperatorTotalStoppedValidatorsReported,
  } from '../../generated/NodeOperatorsRegistry/NodeOperatorsRegistry'
import {
  NodeOperator,
} from '../../generated/schema'


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
