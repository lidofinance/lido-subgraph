import { BigInt } from '@graphprotocol/graph-ts'
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
  TotalReward,
  OracleVersion,
  AllowedBeaconBalanceRelativeDecrease,
  AllowedBeaconBalanceAnnualRelativeIncrease,
  OracleExpectedEpoch,
  OracleTotalShares,
  BeaconReport,
  BeaconSpec,
  BeaconReportReceiver,
  Totals,
  NodeOperatorsShares,
} from '../generated/schema'

import { CALCULATION_UNIT } from './constants'

import { loadLidoContract, loadNosContract } from './contracts'

import {
  nextIncrementalId,
  lastIncrementalId,
  guessOracleRunsTotal,
} from './utils'

export function handleCompleted(event: Completed): void {
  let previousCompleted = OracleCompleted.load(
    lastIncrementalId(
      'OracleCompleted',
      guessOracleRunsTotal(event.block.timestamp)
    )
  )
  let newCompleted = new OracleCompleted(
    nextIncrementalId(
      'OracleCompleted',
      guessOracleRunsTotal(event.block.timestamp)
    )
  )

  let contract = loadLidoContract()

  newCompleted.epochId = event.params.epochId
  newCompleted.beaconBalance = event.params.beaconBalance
  newCompleted.beaconValidators = event.params.beaconValidators

  newCompleted.block = event.block.number
  newCompleted.blockTime = event.block.timestamp
  newCompleted.transactionHash = event.transaction.hash

  newCompleted.save()

  // Create an empty TotalReward entity that will be filled on Transfer events
  // We know that in this transaction there will be Transfer events which we can identify by existence of TotalReward entity with transaction hash as its id
  let totalRewardsEntity = new TotalReward(event.transaction.hash.toHex())

  totalRewardsEntity.block = event.block.number
  totalRewardsEntity.blockTime = event.block.timestamp
  totalRewardsEntity.transactionIndex = event.transaction.index
  totalRewardsEntity.logIndex = event.logIndex
  totalRewardsEntity.transactionLogIndex = event.transactionLogIndex

  let oldBeaconValidators = previousCompleted
    ? previousCompleted.beaconValidators
    : BigInt.fromI32(0)

  let oldBeaconBalance = previousCompleted
    ? previousCompleted.beaconBalance
    : BigInt.fromI32(0)

  let newBeaconValidators = event.params.beaconValidators
  let newBeaconBalance = event.params.beaconBalance

  let wei = BigInt.fromString('1000000000000000000')
  let depositSize = BigInt.fromI32(32)
  let depositAmount = depositSize.times(wei)

  let appearedValidators = newBeaconValidators.minus(oldBeaconValidators)
  let appearedValidatorsDeposits = appearedValidators.times(depositAmount)
  let rewardBase = appearedValidatorsDeposits.plus(oldBeaconBalance)
  let newTotalRewards = newBeaconBalance.minus(rewardBase)

  totalRewardsEntity.totalRewardsWithFees = newTotalRewards
  // Setting totalRewards to totalRewardsWithFees so we can subtract fees from it
  totalRewardsEntity.totalRewards = newTotalRewards
  // Setting initial 0 value so we can add fees to it
  totalRewardsEntity.totalFee = BigInt.fromI32(0)

  // Will save later, still need to add shares data

  // Totals and rewards data logic
  // Totals are already non-null on first oracle report
  let totals = Totals.load('') as Totals

  // Keeping data before increase
  let totalPooledEtherBefore = totals.totalPooledEther
  let totalSharesBefore = totals.totalShares

  let feeBasis = BigInt.fromI32(contract.getFee()) // 1000

  // Increasing totals
  let totalPooledEtherAfter = totals.totalPooledEther.plus(newTotalRewards)

  // Overall shares for all rewards cut
  let shares2mint = newTotalRewards
    .times(feeBasis)
    .times(totals.totalShares)
    .div(
      totalPooledEtherAfter
        .times(CALCULATION_UNIT)
        .minus(feeBasis.times(newTotalRewards))
    )

  let totalSharesAfter = totals.totalShares.plus(shares2mint)

  totals.totalPooledEther = totalPooledEtherAfter
  totals.totalShares = totalSharesAfter
  totals.save()

  // Further shares calculations
  let feeDistribution = contract.getFeeDistribution()
  let insuranceFeeBasisPoints = BigInt.fromI32(feeDistribution.value1) // 5000
  let operatorsFeeBasisPoints = BigInt.fromI32(feeDistribution.value2) // 5000

  let sharesToInsuranceFund = shares2mint
    .times(insuranceFeeBasisPoints)
    .div(CALCULATION_UNIT)

  let sharesToOperators = shares2mint
    .times(operatorsFeeBasisPoints)
    .div(CALCULATION_UNIT)

  totalRewardsEntity.shares2mint = shares2mint

  totalRewardsEntity.sharesToInsuranceFund = sharesToInsuranceFund
  totalRewardsEntity.sharesToOperators = sharesToOperators

  totalRewardsEntity.totalPooledEtherBefore = totalPooledEtherBefore
  totalRewardsEntity.totalPooledEtherAfter = totalPooledEtherAfter
  totalRewardsEntity.totalSharesBefore = totalSharesBefore
  totalRewardsEntity.totalSharesAfter = totalSharesAfter

  // We will save the entity later

  let registry = loadNosContract()
  let distr = registry.getRewardsDistribution(sharesToOperators)

  let opAddresses = distr.value0
  let opShares = distr.value1

  let sharesToOperatorsActual = BigInt.fromI32(0)

  for (let i = 0; i < opAddresses.length; i++) {
    let addr = opAddresses[i]
    let shares = opShares[i]

    // Incrementing total of actual shares distributed
    sharesToOperatorsActual = sharesToOperatorsActual.plus(shares)

    let nodeOperatorsShares = new NodeOperatorsShares(
      event.transaction.hash.toHex() + '-' + addr.toHexString()
    )
    nodeOperatorsShares.totalReward = event.transaction.hash.toHex()

    nodeOperatorsShares.address = addr
    nodeOperatorsShares.shares = shares

    nodeOperatorsShares.save()
  }

  // Handling dust (rounding leftovers)
  // sharesToInsuranceFund are exact
  // sharesToOperators are with leftovers which we need to account for
  let sharesToTreasury = shares2mint
    .minus(sharesToInsuranceFund)
    .minus(sharesToOperatorsActual)

  totalRewardsEntity.sharesToTreasury = sharesToTreasury

  totalRewardsEntity.save()
}

export function handleMemberAdded(event: MemberAdded): void {
  let entity = new OracleMember(event.params.member.toHexString())

  entity.member = event.params.member
  entity.removed = false

  entity.save()
}

export function handleMemberRemoved(event: MemberRemoved): void {
  let entity = OracleMember.load(event.params.member.toHexString())

  if (entity == null) {
    entity = new OracleMember(event.params.member.toHexString())
  }

  entity.removed = true

  entity.save()
}

export function handleQuorumChanged(event: QuorumChanged): void {
  let entity = new OracleQuorumChange(
    event.transaction.hash.toHex() + event.logIndex.toString()
  )

  entity.quorum = event.params.quorum

  entity.save()
}

export function handleContractVersionSet(event: ContractVersionSet): void {
  let entity = new OracleVersion(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.version = event.params.version

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp

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
