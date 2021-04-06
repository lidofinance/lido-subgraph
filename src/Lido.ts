import { Address } from '@graphprotocol/graph-ts'
import { BigDecimal } from '@graphprotocol/graph-ts'
import { BigInt } from '@graphprotocol/graph-ts'
import { Lido } from '../generated/Lido/Lido'
import {
  Stopped,
  Resumed,
  Transfer,
  Approval,
  FeeSet,
  FeeDistributionSet,
  WithdrawalCredentialsSet,
  Submitted,
  Unbuffered,
  Withdrawal,
} from '../generated/Lido/Lido'
import {
  LidoStopped,
  LidoResumed,
  LidoTransfer,
  LidoApproval,
  LidoFee,
  LidoFeeDistribution,
  LidoWithdrawalCredential,
  LidoSubmission,
  LidoUnbuffered,
  LidoWithdrawal,
  SharesToStethRatio,
  TotalReward,
  NodeOperatorFees,
} from '../generated/schema'

import { lastIncrementalId, guessOracleRunsTotal } from './utils'

export function handleStopped(event: Stopped): void {
  let entity = new LidoStopped(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.blocktime = event.block.timestamp

  entity.save()
}

export function handleResumed(event: Resumed): void {
  let entity = new LidoResumed(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.blocktime = event.block.timestamp

  entity.save()
}

export function handleTransfer(event: Transfer): void {
  let entity = new LidoTransfer(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.from = event.params.from
  entity.to = event.params.to
  entity.value = event.params.value
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash.toHexString()

  // Try to load the ratio from most recent oracle report
  let ratio = SharesToStethRatio.load(
    lastIncrementalId(
      'SharesToStethRatio',
      guessOracleRunsTotal(event.block.timestamp)
    )
  )

  // Check if there has actually been an oracle report already and default to 1 if not
  // At deploy ratio was 1 to 1
  let sharesToStethRatio = ratio ? ratio.ratio : BigDecimal.fromString('1')

  // Calculate shares amount for this transfer using sharesToSteth ratio
  let shares = event.params.value.toBigDecimal().div(sharesToStethRatio)

  entity.shares = shares
  entity.save()

  let fromZeros =
    event.params.from.toHexString() ==
    '0x0000000000000000000000000000000000000000'

  // TODO: Make treasury address dynamic by calling Lido.getTreasury()
  let isFeeDistributionToTreasury =
    fromZeros &&
    event.params.to.toHexString() ==
      '0x0a9879494d2f2ac749cf84bd043e295da5b83623'

  // Graph's less or equal to helper
  let isDust = event.params.value.le(BigInt.fromI32(10000))

  let totalRewardsEntity: TotalReward | null = TotalReward.load(
    event.transaction.hash.toHex()
  )

  let rewardsEntityExists = totalRewardsEntity !== null

  if (rewardsEntityExists && isFeeDistributionToTreasury && !isDust) {
    // Handling the transfer event to treasury

    let contract = Lido.bind(
      Address.fromString('0x5feb011f04ec47ca42e75f5ac2bea4c50a646054')
    )

    let totalFeesRaw = contract.getFee() // Returns staking rewards fee rate, output feeBasisPoints eg 1000
    let feeDistribution = contract.getFeeDistribution() // Returns fee distribution proportion, output: treasuryFeeBasisPoints eg 0, insuranceFeeBasisPoints eg 5000, operatorsFeeBasisPoints eg 5000

    // 1 basis point is equal to 0.01% // eg totalFeesPercent = 1000 x 0.01 = 10%

    // Transform things from basis points to decimal fractions like 0.1 and 0.05
    let totalFeesUntyped = totalFeesRaw * 0.0001
    let insuranceFeeUntyped = feeDistribution.value1 * 0.0001 * totalFeesUntyped
    let treasuryFeeUntyped = feeDistribution.value0 * 0.0001 * totalFeesUntyped

    // Proper types for our calculations
    let insuranceFee = BigDecimal.fromString(insuranceFeeUntyped.toString())
    let treasuryFee = BigDecimal.fromString(treasuryFeeUntyped.toString())
    let totalFees = BigDecimal.fromString(totalFeesUntyped.toString())

    let value = event.params.value.toBigDecimal()

    // Knowing distribution to treasury amount and it's percentage, we can calculate total sum
    let sumWithFees = value.div(insuranceFee)

    // Total rewards without fees
    let percentWithoutFees = BigDecimal.fromString('1').minus(totalFees)
    let totalRewards = sumWithFees.times(percentWithoutFees)

    totalRewardsEntity.totalRewards = totalRewards
    totalRewardsEntity.totalRewardsWithFees = sumWithFees
    totalRewardsEntity.insuranceFee = sumWithFees.times(insuranceFee)
    totalRewardsEntity.treasuryFee = sumWithFees.times(treasuryFee)
    totalRewardsEntity.totalFee = sumWithFees.times(totalFees)

    totalRewardsEntity.save()
  } else if (rewardsEntityExists && isFeeDistributionToTreasury && isDust) {
    // Handling dust transfer event

    let totalRewardsEntity = TotalReward.load(event.transaction.hash.toHex())

    totalRewardsEntity.dust = event.params.value
    totalRewardsEntity.save()
  } else if (rewardsEntityExists && fromZeros) {
    // Handling node operator fee transfer to node operator

    let nodeOperatorFees = new NodeOperatorFees(
      event.transaction.hash.toHex() + '-' + event.logIndex.toString()
    )

    // Reference to TotalReward entity
    nodeOperatorFees.totalReward = event.transaction.hash.toHex()

    nodeOperatorFees.address = event.params.to.toHex()
    nodeOperatorFees.fee = event.params.value

    nodeOperatorFees.save()
  }
}

export function handleApproval(event: Approval): void {
  let entity = new LidoApproval(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.owner = event.params.owner
  entity.spender = event.params.spender
  entity.value = event.params.value

  entity.save()
}

export function handleFeeSet(event: FeeSet): void {
  let entity = new LidoFee(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.feeBasisPoints = event.params.feeBasisPoints

  entity.save()
}

export function handleFeeDistributionSet(event: FeeDistributionSet): void {
  let entity = new LidoFeeDistribution(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.treasuryFeeBasisPoints = event.params.treasuryFeeBasisPoints
  entity.insuranceFeeBasisPoints = event.params.insuranceFeeBasisPoints
  entity.operatorsFeeBasisPoints = event.params.operatorsFeeBasisPoints

  entity.save()
}

export function handleWithdrawalCredentialsSet(
  event: WithdrawalCredentialsSet
): void {
  let entity = new LidoWithdrawalCredential(
    event.params.withdrawalCredentials.toHex()
  )

  entity.withdrawalCredentials = event.params.withdrawalCredentials

  entity.save()
}

export function handleSubmit(event: Submitted): void {
  let entity = new LidoSubmission(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.sender = event.params.sender
  entity.amount = event.params.amount
  entity.referral = event.params.referral

  entity.blockTime = event.block.timestamp

  entity.save()
}

export function handleUnbuffered(event: Unbuffered): void {
  let entity = new LidoUnbuffered(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.amount = event.params.amount

  entity.save()
}

export function handleWithdrawal(event: Withdrawal): void {
  let entity = new LidoWithdrawal(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.sender = event.params.sender
  entity.tokenAmount = event.params.tokenAmount
  entity.sentFromBuffer = event.params.sentFromBuffer
  entity.pubkeyHash = event.params.pubkeyHash
  entity.etherAmount = event.params.etherAmount

  entity.save()
}
