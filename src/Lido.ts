import { BigInt } from '@graphprotocol/graph-ts'
import { store } from '@graphprotocol/graph-ts'
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

import { wcKeyCrops } from './wcKeyCrops'

export function handleStopped(event: Stopped): void {
  let entity = new LidoStopped(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp

  entity.save()
}

export function handleResumed(event: Resumed): void {
  let entity = new LidoResumed(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp

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
  entity.transactionHash = event.transaction.hash

  // Try to load the ratio from most recent oracle report
  let ratio = SharesToStethRatio.load(
    lastIncrementalId(
      'SharesToStethRatio',
      guessOracleRunsTotal(event.block.timestamp)
    )
  )

  // At deploy ratio was 1 to 1 if no Oracle report is found
  let shares = ratio
    ? event.params.value.times(ratio.totalShares).div(ratio.pooledEth)
    : event.params.value

  entity.shares = shares
  entity.save()

  let fromZeros =
    event.params.from.toHexString() ==
    '0x0000000000000000000000000000000000000000'

  // TODO: Make treasury address dynamic by calling Lido.getTreasury()
  let isFeeDistributionToTreasury =
    fromZeros &&
    event.params.to.toHexString() ==
      '0x3e40d73eb977dc6a537af587d48316fee66e9c8c'

  // Graph's less or equal to helper
  let isDust = event.params.value.le(BigInt.fromI32(20000))

  let totalRewardsEntity: TotalReward | null = TotalReward.load(
    event.transaction.hash.toHex()
  )

  let rewardsEntityExists = totalRewardsEntity !== null

  if (rewardsEntityExists && isFeeDistributionToTreasury && !isDust) {
    // Handling the Insurance Fee transfer event to treasury

    totalRewardsEntity.insuranceFee = event.params.value

    totalRewardsEntity.totalRewards = totalRewardsEntity.totalRewards.minus(
      event.params.value
    )
    totalRewardsEntity.totalFee = totalRewardsEntity.totalFee.plus(
      event.params.value
    )

    totalRewardsEntity.save()
  } else if (rewardsEntityExists && isFeeDistributionToTreasury && isDust) {
    // Handling dust transfer event

    totalRewardsEntity.dust = event.params.value

    totalRewardsEntity.totalRewards = totalRewardsEntity.totalRewards.minus(
      event.params.value
    )
    totalRewardsEntity.totalFee = totalRewardsEntity.totalFee.plus(
      event.params.value
    )

    totalRewardsEntity.save()
  } else if (rewardsEntityExists && fromZeros) {
    // Handling node operator fee transfer to node operator

    let nodeOperatorFees = new NodeOperatorFees(
      event.transaction.hash.toHex() + '-' + event.logIndex.toString()
    )

    // Reference to TotalReward entity
    nodeOperatorFees.totalReward = event.transaction.hash.toHex()

    nodeOperatorFees.address = event.params.to
    nodeOperatorFees.fee = event.params.value

    totalRewardsEntity.totalRewards = totalRewardsEntity.totalRewards.minus(
      event.params.value
    )
    totalRewardsEntity.totalFee = totalRewardsEntity.totalFee.plus(
      event.params.value
    )

    totalRewardsEntity.save()
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

  entity.block = event.block.number
  entity.blockTime = event.block.number

  entity.save()

  // Cropping unused keys on withdrawal credentials change
  if (
    event.params.withdrawalCredentials.toHexString() ==
    '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f'
  ) {
    let keys = wcKeyCrops.get(
      '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f'
    )

    let length = keys.length

    // There is no for...of loop in AS
    for (let i = 0; i < length; i++) {
      let key = keys[i]
      store.remove('NodeOperatorSigningKey', key)
    }
  }
}

export function handleSubmit(event: Submitted): void {
  let entity = new LidoSubmission(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.sender = event.params.sender
  entity.amount = event.params.amount
  entity.referral = event.params.referral

  entity.block = event.block.number
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
