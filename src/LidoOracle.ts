import { Address } from '@graphprotocol/graph-ts'
import { Lido } from '../generated/Lido/Lido'
import {
  MemberAdded,
  MemberRemoved,
  QuorumChanged,
  Completed,
} from '../generated/LidoOracle/LidoOracle'
import {
  OracleCompleted,
  OracleMember,
  OracleQuorumChange,
  SharesToStethRatio,
  TotalReward,
} from '../generated/schema'

import { nextIncrementalId, guessOracleRunsTotal } from './utils'

export function handleCompleted(event: Completed): void {
  let entity = new OracleCompleted(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.epochId = event.params.epochId
  entity.beaconBalance = event.params.beaconBalance
  entity.beaconValidators = event.params.beaconValidators
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp

  entity.save()

  // Create an empty TotalReward entity that will be filled on Transfer events
  // We know that in this transaction there will be Transfer events which we can identify by existence of TotalReward entity with transaction hash as its id
  let totalRewardsEntity = new TotalReward(event.transaction.hash.toHex())
  totalRewardsEntity.block = event.block.number
  totalRewardsEntity.blockTime = event.block.timestamp
  totalRewardsEntity.save()

  // Calculate and add this day's shares to steth ratio by calling an functions using an archive node

  let contract = Lido.bind(
    Address.fromString('0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84')
  )

  let totalShares = contract.getTotalShares()
  let pooledEth = contract.getPooledEthByShares(totalShares)

  // Ratio of ether to shares
  let ratio = pooledEth.toBigDecimal().div(totalShares.toBigDecimal())

  let sharesToStethRatio = new SharesToStethRatio(
    nextIncrementalId(
      'SharesToStethRatio',
      guessOracleRunsTotal(event.block.timestamp)
    )
  )
  sharesToStethRatio.totalShares = totalShares
  sharesToStethRatio.pooledEth = pooledEth
  sharesToStethRatio.ratio = ratio
  sharesToStethRatio.block = event.block.number
  sharesToStethRatio.blockTime = event.block.timestamp
  sharesToStethRatio.save()
}

export function handleMemberAdded(event: MemberAdded): void {
  let entity = new OracleMember(event.params.member.toHex())

  entity.member = event.params.member
  entity.removed = false

  entity.save()
}

export function handleMemberRemoved(event: MemberRemoved): void {
  let entity = OracleMember.load(event.params.member.toHex())

  if (entity == null) {
    entity = new OracleMember(event.params.member.toHex())
  }

  entity.removed = true

  entity.save()
}

export function handleQuorumChanged(event: QuorumChanged): void {
  let entity = new OracleQuorumChange(event.params.quorum.toHex())

  entity.quorum = event.params.quorum

  entity.save()
}
