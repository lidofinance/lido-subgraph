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
  BeaconReport,
  BeaconSpec,
  BeaconReportReceiver,
  Totals,
  NodeOperatorsShares,
} from '../generated/schema'

import { CALCULATION_UNIT, DEPOSIT_AMOUNT, ZERO, ONE } from './constants'

import { loadLidoContract, loadNosContract } from './contracts'

import { lastIncrementalId, guessOracleRunsTotal } from './utils'

export function handleCompleted(event: Completed): void {
  let previousCompletedId = lastIncrementalId(
    'OracleCompleted',
    guessOracleRunsTotal(event.block.timestamp)
  )
  let nextCompletedId = BigInt.fromString(previousCompletedId)
    .plus(ONE)
    .toString()

  let previousCompleted = OracleCompleted.load(previousCompletedId)
  let newCompleted = new OracleCompleted(nextCompletedId)

  let contract = loadLidoContract()

  newCompleted.epochId = event.params.epochId
  newCompleted.beaconBalance = event.params.beaconBalance
  newCompleted.beaconValidators = event.params.beaconValidators

  newCompleted.block = event.block.number
  newCompleted.blockTime = event.block.timestamp
  newCompleted.transactionHash = event.transaction.hash

  newCompleted.save()

  let oldBeaconValidators = previousCompleted
    ? previousCompleted.beaconValidators
    : ZERO

  let oldBeaconBalance = previousCompleted
    ? previousCompleted.beaconBalance
    : ZERO

  let newBeaconValidators = event.params.beaconValidators
  let newBeaconBalance = event.params.beaconBalance

  // TODO: Can appearedValidators be negative? If eg active keys are deleted for some reason
  let appearedValidators = newBeaconValidators.minus(oldBeaconValidators)
  let appearedValidatorsDeposits = appearedValidators.times(DEPOSIT_AMOUNT)
  let rewardBase = appearedValidatorsDeposits.plus(oldBeaconBalance)
  let newTotalRewards = newBeaconBalance.minus(rewardBase)

  let positiveRewards = newTotalRewards.gt(ZERO)

  // Totals and rewards data logic
  // Totals are already non-null on first oracle report
  let totals = Totals.load('') as Totals

  // Keeping data before increase
  let totalPooledEtherBefore = totals.totalPooledEther
  let totalSharesBefore = totals.totalShares

  // Increasing or decreasing totals
  let totalPooledEtherAfter = positiveRewards
    ? totals.totalPooledEther.plus(newTotalRewards)
    : totals.totalPooledEther.minus(newTotalRewards.abs())

  // There are no rewards so we don't need a new TotalReward entity
  if (!positiveRewards) {
    totals.totalPooledEther = totalPooledEtherAfter
    return
  }

  // Create an empty TotalReward entity that will be filled on Transfer events
  // We know that in this transaction there will be Transfer events which we can identify by existence of TotalReward entity with transaction hash as its id
  let totalRewardsEntity = new TotalReward(event.transaction.hash.toHex())

  // Saving meta values
  totalRewardsEntity.block = event.block.number
  totalRewardsEntity.blockTime = event.block.timestamp
  totalRewardsEntity.transactionIndex = event.transaction.index
  totalRewardsEntity.logIndex = event.logIndex
  totalRewardsEntity.transactionLogIndex = event.transactionLogIndex

  totalRewardsEntity.totalRewardsWithFees = newTotalRewards
  // Setting totalRewards to totalRewardsWithFees so we can subtract fees from it
  totalRewardsEntity.totalRewards = newTotalRewards
  // Setting initial 0 value so we can add fees to it
  totalRewardsEntity.totalFee = ZERO

  let feeBasis = BigInt.fromI32(contract.getFee()) // 1000

  // Overall shares for all rewards cut
  let shares2mint = positiveRewards
    ? newTotalRewards
        .times(feeBasis)
        .times(totals.totalShares)
        .div(
          totalPooledEtherAfter
            .times(CALCULATION_UNIT)
            .minus(feeBasis.times(newTotalRewards))
        )
    : ZERO

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

  let sharesToOperatorsActual = ZERO

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
  let contract = loadLidoContract()

  let entity = TotalReward.load(event.transaction.hash.toHex())

  if (!entity) {
    return
  }

  let preTotalPooledEther = event.params.preTotalPooledEther
  let postTotalPooledEther = event.params.postTotalPooledEther

  entity.preTotalPooledEther = preTotalPooledEther
  entity.postTotalPooledEther = postTotalPooledEther
  entity.timeElapsed = event.params.timeElapsed
  entity.totalShares = event.params.totalShares

  /**
  
  aprRaw -> aprBeforeFees -> apr
  
  aprRaw - APR straight from validator balances without adjustments
  aprBeforeFees - APR compensated for time difference between oracle reports
  apr - APR with fees subtracted and time-compensated
  
  **/

  // APR without subtracting fees and without any compensations
  let aprRaw = postTotalPooledEther
    .toBigDecimal()
    .div(preTotalPooledEther.toBigDecimal())
    .minus(BigInt.fromI32(1).toBigDecimal())
    .times(BigInt.fromI32(100).toBigDecimal())
    .times(BigInt.fromI32(365).toBigDecimal())

  entity.aprRaw = aprRaw

  // Time compensation logic

  let timeElapsed = event.params.timeElapsed

  let day = BigInt.fromI32(60 * 60 * 24).toBigDecimal()

  let dayDifference = timeElapsed.toBigDecimal().div(day)

  let aprBeforeFees = aprRaw.div(dayDifference)

  entity.aprBeforeFees = aprBeforeFees

  // Subtracting fees

  let feeBasis = BigInt.fromI32(contract.getFee()).toBigDecimal() // 1000

  let apr = aprBeforeFees.minus(
    aprBeforeFees
      .times(CALCULATION_UNIT.toBigDecimal())
      .div(feeBasis)
      .div(BigInt.fromI32(100).toBigDecimal())
  )

  entity.apr = apr

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp

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
