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
  TotalReward,
  NodeOperatorFees,
  Totals,
  NodeOperatorsShares,
  Shares,
} from '../generated/schema'

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
  entity.transactionIndex = event.transaction.index
  entity.logIndex = event.logIndex
  entity.transactionLogIndex = event.transactionLogIndex

  let fromZeros =
    event.params.from.toHexString() ==
    '0x0000000000000000000000000000000000000000'

  let totalRewardsEntity: TotalReward | null = TotalReward.load(
    event.transaction.hash.toHex()
  )

  let rewardsEntityExists = totalRewardsEntity !== null

  // We know that for rewards distribution shares are minted with same from 0x0 address as staking
  // We can save this indicator which helps us distinguish such mints from staking events
  entity.mintWithoutSubmission = rewardsEntityExists ? true : false

  // Entity is already created at this point
  let totals = Totals.load('')

  entity.totalPooledEther = totals.totalPooledEther
  entity.totalShares = totals.totalShares

  // At deploy ratio was 1 to 1 if no Oracle report is found
  let shares = event.params.value
    .times(totals.totalShares)
    .div(totals.totalPooledEther)

  if (!fromZeros) {
    entity.shares = shares
  }

  // We'll save the entity later

  let isFeeDistributionToTreasury =
    fromZeros &&
    (event.params.to.toHexString() ==
      '0x3e40d73eb977dc6a537af587d48316fee66e9c8c' || // Mainnet
      event.params.to.toHexString() ==
        '0x0a9879494d2f2ac749cf84bd043e295da5b83623') // Goerli

  // graph-ts less or equal to
  let isDust = event.params.value.le(BigInt.fromI32(50000))

  if (rewardsEntityExists && isFeeDistributionToTreasury && !isDust) {
    // Handling the Insurance Fee transfer event to treasury

    entity.shares = totalRewardsEntity.sharesToInsuranceFund

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

    entity.shares = totalRewardsEntity.sharesToTreasury

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

    let nodeOperatorsShares = NodeOperatorsShares.load(
      event.transaction.hash.toHex() + '-' + event.params.to.toHex()
    )
    let sharesToOperator = nodeOperatorsShares.shares

    entity.shares = sharesToOperator

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

  if (entity.shares) {
    // Decreasing from address shares
    // No point in changing 0x0 shares
    if (!fromZeros) {
      let sharesFromEntity = Shares.load(event.params.from.toHexString())
      // Address must already have shares, HOWEVER:
      // Someone can and managed to produce events of 0 to 0 transfers
      if (!sharesFromEntity) {
        sharesFromEntity = new Shares(event.params.from.toHexString())
        sharesFromEntity.shares = BigInt.fromI32(0)
      }

      entity.sharesBeforeDecrease = sharesFromEntity.shares
      sharesFromEntity.shares = sharesFromEntity.shares.minus(entity.shares!)
      entity.sharesAfterDecrease = sharesFromEntity.shares

      sharesFromEntity.save()

      // Calculating new balance
      entity.balanceAfterDecrease = entity.sharesAfterDecrease
        .times(totals.totalPooledEther)
        .div(totals.totalShares)
    }

    // Increasing to address shares
    let sharesToEntity = Shares.load(event.params.to.toHexString())

    if (!sharesToEntity) {
      sharesToEntity = new Shares(event.params.to.toHexString())
      sharesToEntity.shares = BigInt.fromI32(0)
    }

    entity.sharesBeforeIncrease = sharesToEntity.shares
    sharesToEntity.shares = sharesToEntity.shares.plus(entity.shares!)
    entity.sharesAfterIncrease = sharesToEntity.shares

    sharesToEntity.save()

    // Calculating new balance
    entity.balanceAfterIncrease = entity.sharesAfterIncrease
      .times(totals.totalPooledEther)
      .div(totals.totalShares)
  }

  entity.save()
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

  // Loading totals
  let totals = Totals.load('')

  let isFirstSubmission = !totals

  if (isFirstSubmission) {
    totals = new Totals('')
    totals.totalPooledEther = BigInt.fromI32(0)
    totals.totalShares = BigInt.fromI32(0)
  }

  entity.sender = event.params.sender
  entity.amount = event.params.amount
  entity.referral = event.params.referral

  // At deployment ratio is 1:1
  let shares = !isFirstSubmission
    ? event.params.amount.times(totals.totalShares).div(totals.totalPooledEther)
    : event.params.amount
  entity.shares = shares

  // Increasing address shares
  let sharesEntity = Shares.load(event.params.sender.toHex())

  if (!sharesEntity) {
    sharesEntity = new Shares(event.params.sender.toHex())
    sharesEntity.shares = BigInt.fromI32(0)
  }

  entity.sharesBefore = sharesEntity.shares
  sharesEntity.shares = sharesEntity.shares.plus(shares)
  entity.sharesAfter = sharesEntity.shares

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.transactionIndex = event.transaction.index
  entity.logIndex = event.logIndex
  entity.transactionLogIndex = event.transactionLogIndex

  entity.totalPooledEtherBefore = totals.totalPooledEther
  entity.totalSharesBefore = totals.totalShares

  // Increasing Totals
  totals.totalPooledEther = totals.totalPooledEther.plus(event.params.amount)
  totals.totalShares = totals.totalShares.plus(shares)

  entity.totalPooledEtherAfter = totals.totalPooledEther
  entity.totalSharesAfter = totals.totalShares

  // Calculating new balance
  entity.balanceAfter = entity.sharesAfter
    .times(totals.totalPooledEther)
    .div(totals.totalShares)

  entity.save()
  sharesEntity.save()
  totals.save()
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
