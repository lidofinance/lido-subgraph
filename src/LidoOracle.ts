import { Address } from '@graphprotocol/graph-ts'
import { Lido } from '../generated/Lido/Lido'
import {
  MemberAdded,
  MemberRemoved,
  QuorumChanged,
  Completed,
  ContractVersionSet,
  PostTotalShares,
  BeaconReported,
  BeaconSpecSet,
  ExpectedEpochIdUpdated,
  BeaconReportReceiverSet,
  AllowedBeaconBalanceRelativeDecreaseSet,
  AllowedBeaconBalanceAnnualRelativeIncreaseSet,
} from '../generated/LidoOracle/LidoOracle'
import {
  OracleCompleted,
  OracleMember,
  OracleQuorumChange,
  SharesToStethRatio,
  TotalReward,
  OracleVersion,
  AllowedBeaconBalanceRelativeDecrease,
  AllowedBeaconBalanceAnnualRelativeIncrease,
  OracleExpectedEpoch,
  OracleTotalShares,
  BeaconReport,
  BeaconSpec,
  BeaconReportReceiver,
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
    Address.fromString('0x5feb011f04ec47ca42e75f5ac2bea4c50a646054')
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

export function handleContractVersionSet(event: ContractVersionSet): void {
  let entity = new OracleVersion(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.version = event.params.version
  entity.block = event.block.number

  entity.save()
}

export function handlePostTotalShares(event: PostTotalShares): void {
  let entity = new OracleTotalShares(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.postTotalPooledEther = event.params.postTotalPooledEther
  entity.preTotalPooledEther = event.params.preTotalPooledEther
  entity.timeElapsed = event.params.timeElapsed
  entity.totalShares = event.params.totalShares

  entity.save()
}

export function handleBeaconReported(event: BeaconReported): void {
  let entity = new BeaconReport(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.epochId = event.params.epochId
  entity.beaconBalance = event.params.beaconBalance
  entity.beaconValidators = event.params.beaconValidators
  entity.caller = event.params.caller

  entity.save()
}

export function handleBeaconSpecSet(event: BeaconSpecSet): void {
  let entity = new BeaconSpec(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.epochsPerFrame = event.params.epochsPerFrame
  entity.slotsPerEpoch = event.params.slotsPerEpoch
  entity.secondsPerSlot = event.params.secondsPerSlot
  entity.genesisTime = event.params.genesisTime

  entity.save()
}

export function handleExpectedEpochIdUpdated(
  event: ExpectedEpochIdUpdated
): void {
  let entity = new OracleExpectedEpoch(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.epochId = event.params.epochId

  entity.save()
}

export function handleBeaconReportReceiverSet(
  event: BeaconReportReceiverSet
): void {
  let entity = new BeaconReportReceiver(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.callback = event.params.callback

  entity.save()
}

export function handleAllowedBeaconBalanceRelativeDecreaseSet(
  event: AllowedBeaconBalanceRelativeDecreaseSet
): void {
  let entity = new AllowedBeaconBalanceRelativeDecrease(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.value = event.params.value

  entity.save()
}

export function handleAllowedBeaconBalanceAnnualRelativeIncreaseSet(
  event: AllowedBeaconBalanceAnnualRelativeIncreaseSet
): void {
  let entity = new AllowedBeaconBalanceAnnualRelativeIncrease(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.value = event.params.value

  entity.save()
}
