import { Bytes, ethereum, BigInt } from '@graphprotocol/graph-ts'
import { Total, Share, Stat, LidoTransfer, TotalReward, Holder, OracleReport, AppVersion } from '../generated/schema'
import {
  CALCULATION_UNIT,
  E27_PRECISION_BASE,
  LIDO_APP_ID,
  NOR_APP_ID,
  ONE,
  ORACLE_APP_ID,
  SECONDS_PER_YEAR,
  PROTOCOL_UPG_IDX_V1_SHARES,
  PROTOCOL_UPG_IDX_V2,
  ZERO,
  ZERO_ADDRESS,
  isAppVerMatchUpgId,
  isBlockMatchUpgId
} from './constants'
import { Transfer } from '../generated/Lido/Lido'

export function _loadLidoTransferEntity(event: Transfer): LidoTransfer {
  const id = event.transaction.hash.concatI32(event.logIndex.toI32())
  let entity = LidoTransfer.load(id)
  if (!entity) {
    entity = new LidoTransfer(id)
    entity.from = event.params.from
    entity.to = event.params.to
    entity.block = event.block.number
    entity.blockTime = event.block.timestamp
    entity.transactionHash = event.transaction.hash
    entity.transactionIndex = event.transaction.index
    entity.logIndex = event.logIndex
    entity.transactionLogIndex = event.logIndex

    entity.value = event.params.value
    entity.shares = ZERO
    entity.totalPooledEther = ZERO
    entity.totalShares = ZERO

    // from acc
    entity.sharesBeforeDecrease = ZERO
    entity.sharesAfterDecrease = ZERO
    entity.balanceAfterDecrease = ZERO

    // to acc
    entity.sharesBeforeIncrease = ZERO
    entity.sharesAfterIncrease = ZERO
    entity.balanceAfterIncrease = ZERO

    entity.mintWithoutSubmission = false
  }
  return entity
}

export function _loadOracleReport(refSLot: BigInt, event: ethereum.Event, create: bool = false): OracleReport | null {
  let entity = OracleReport.load(refSLot.toString())
  if (!entity && create) {
    entity = new OracleReport(refSLot.toString())
    entity.itemsProcessed = ZERO
    entity.itemsCount = ZERO

    // entity.block = event.block.number
    // entity.blockTime = event.block.timestamp
    // entity.transactionHash = event.transaction.hash
    // entity.logIndex = event.logIndex
  }

  return entity
}

export function _loadTotalRewardEntity(event: ethereum.Event, create: bool = false): TotalReward | null {
  let entity = TotalReward.load(event.transaction.hash)
  if (!entity && create) {
    entity = new TotalReward(event.transaction.hash)

    entity.block = event.block.number
    entity.blockTime = event.block.timestamp
    entity.transactionHash = event.transaction.hash
    entity.transactionIndex = event.transaction.index
    entity.logIndex = event.logIndex
    entity.transactionLogIndex = event.logIndex

    entity.feeBasis = ZERO
    entity.treasuryFeeBasisPoints = ZERO
    entity.insuranceFeeBasisPoints = ZERO
    entity.operatorsFeeBasisPoints = ZERO

    entity.totalRewardsWithFees = ZERO
    entity.totalRewards = ZERO
    entity.totalFee = ZERO
    entity.treasuryFee = ZERO
    entity.insuranceFee = ZERO
    entity.operatorsFee = ZERO
    entity.dust = ZERO
    entity.mevFee = ZERO

    entity.apr = ZERO.toBigDecimal()
    entity.aprRaw = ZERO.toBigDecimal()
    entity.aprBeforeFees = ZERO.toBigDecimal()

    entity.timeElapsed = ZERO

    entity.totalPooledEtherAfter = ZERO
    entity.totalSharesAfter = ZERO

    entity.totalRewardsWithFees = ZERO
    entity.totalRewards = ZERO
    entity.totalFee = ZERO
    entity.operatorsFee = ZERO

    entity.shares2mint = ZERO

    entity.sharesToOperators = ZERO
    entity.sharesToTreasury = ZERO
    entity.sharesToInsuranceFund = ZERO
    entity.dustSharesToTreasury = ZERO
  }

  return entity
}

export function _loadStatsEntity(): Stat {
  let stats = Stat.load('')
  if (!stats) {
    stats = new Stat('')
    stats.uniqueHolders = ZERO
    stats.uniqueAnytimeHolders = ZERO
    stats.lastOracleCompletedId = ZERO
    stats.save()
  }
  return stats
}

export function _loadTotalsEntity(create: bool = false): Total | null {
  let totals = Total.load('')
  if (!totals && create) {
    totals = new Total('')
    totals.totalPooledEther = ZERO
    totals.totalShares = ZERO
  }
  return totals
}

export function _loadSharesEntity(id: Bytes, create: bool = false): Share | null {
  let entity = Share.load(id)
  if (!entity && create) {
    entity = new Share(id)
    entity.shares = ZERO
  }
  return entity
}

export function _updateTransferBalances(entity: LidoTransfer): void {
  if (entity.totalShares.isZero()) {
    entity.balanceAfterIncrease = entity.value
    entity.balanceAfterDecrease = ZERO
  } else {
    entity.balanceAfterIncrease = entity.sharesAfterIncrease!.times(entity.totalPooledEther).div(entity.totalShares)
    entity.balanceAfterDecrease = entity.sharesAfterDecrease!.times(entity.totalPooledEther).div(entity.totalShares)
  }
}

export function _updateTransferShares(entity: LidoTransfer): void {
  // Decreasing from address shares
  if (entity.from != ZERO_ADDRESS) {
    // Address must already have shares, HOWEVER:
    // Someone can and managed to produce events of 0 to 0 transfers
    const sharesFromEntity = _loadSharesEntity(entity.from, true)!
    entity.sharesBeforeDecrease = sharesFromEntity.shares

    if (entity.from != entity.to && !entity.shares.isZero()) {
      assert(sharesFromEntity.shares >= entity.shares, 'negative shares decrease on transfer')
      sharesFromEntity.shares = sharesFromEntity.shares.minus(entity.shares)
      sharesFromEntity.save()
    }
    entity.sharesAfterDecrease = sharesFromEntity.shares
  }
  // Increasing to address shares
  if (entity.to != ZERO_ADDRESS) {
    const sharesToEntity = _loadSharesEntity(entity.to, true)!
    entity.sharesBeforeIncrease = sharesToEntity.shares
    if (entity.to != entity.from && !entity.shares.isZero()) {
      sharesToEntity.shares = sharesToEntity.shares.plus(entity.shares)
      sharesToEntity.save()
    }
    entity.sharesAfterIncrease = sharesToEntity.shares
  }
}

export function _updateHolders(entity: LidoTransfer): void {
  // Saving recipient address as a unique stETH holder
  const stats = _loadStatsEntity()

  // skip zero destination for any case
  if (entity.to != ZERO_ADDRESS && !entity.balanceAfterIncrease!.isZero()) {
    let holder = Holder.load(entity.to)
    if (!holder) {
      holder = new Holder(entity.to)
      holder.address = entity.to
      holder.hasBalance = false

      stats.uniqueAnytimeHolders = stats.uniqueAnytimeHolders.plus(ONE)
    }
    if (!holder.hasBalance) {
      holder.hasBalance = true
      stats.uniqueHolders = stats.uniqueHolders.plus(ONE)
    }
    holder.save()
  }

  if (entity.from != ZERO_ADDRESS) {
    const holder = Holder.load(entity.from)
    if (holder) {
      if (holder.hasBalance && entity.balanceAfterDecrease!.isZero()) {
        holder.hasBalance = false
        stats.uniqueHolders = stats.uniqueHolders.minus(ONE)
      }
      holder.save()
    } // else should not be
  }
  stats.save()
}

export function _calcAPR_v1(
  entity: TotalReward,
  preTotalPooledEther: BigInt,
  postTotalPooledEther: BigInt,
  timeElapsed: BigInt,
  feeBasis: BigInt
): void {
  // Lido v1 deprecated approach
  /**
    aprRaw -> aprBeforeFees -> apr

    aprRaw - APR straight from validator balances without adjustments
    aprBeforeFees - APR compensated for time difference between oracle reports
    apr - Time-compensated APR with fees subtracted
    **/

  // APR without subtracting fees and without any compensations
  entity.aprRaw = postTotalPooledEther
    .toBigDecimal()
    .div(preTotalPooledEther.toBigDecimal())
    .minus(BigInt.fromI32(1).toBigDecimal())
    .times(BigInt.fromI32(100).toBigDecimal())
    .times(BigInt.fromI32(365).toBigDecimal())

  // Time-compensated APR
  // (postTotalPooledEther - preTotalPooledEther) * secondsInYear / (preTotalPooledEther * timeElapsed)
  entity.aprBeforeFees = timeElapsed.isZero()
    ? entity.aprRaw
    : postTotalPooledEther
        .minus(preTotalPooledEther)
        .times(SECONDS_PER_YEAR)
        .toBigDecimal()
        .div(preTotalPooledEther.times(timeElapsed).toBigDecimal())
        .times(BigInt.fromI32(100).toBigDecimal())

  // Subtracting fees
  entity.apr = entity.aprBeforeFees.minus(
    entity.aprBeforeFees
      .times(CALCULATION_UNIT.toBigDecimal())
      .div(feeBasis.toBigDecimal())
      .div(BigInt.fromI32(100).toBigDecimal())
  )
}

export function _calcAPR_v2(
  entity: TotalReward,
  preTotalEther: BigInt,
  postTotalEther: BigInt,
  preTotalShares: BigInt,
  postTotalShares: BigInt,
  timeElapsed: BigInt
): void {
  // Lido v2 new approach
  // https://hackmd.io/@lido/rJ8HaBxZ3#How-to-get-APR

  const preShareRate = preTotalEther
    .toBigDecimal()
    .times(E27_PRECISION_BASE)
    .div(preTotalShares.toBigDecimal())

  const postShareRate = postTotalEther
    .toBigDecimal()
    .times(E27_PRECISION_BASE)
    .div(postTotalShares.toBigDecimal())
  const secondsInYear = BigInt.fromI32(60 * 60 * 24 * 365).toBigDecimal()

  entity.apr = secondsInYear
    .times(postShareRate.minus(preShareRate))
    .div(preShareRate)
    .div(timeElapsed.toBigDecimal())

  entity.aprRaw = entity.apr
  entity.aprBeforeFees = entity.apr
}

export const checkAppVer = (block: BigInt, appId: Bytes | null, minUpgId: i32): bool => {
  // first we check block for faster detection
  // if block check fails, try to check app ver
  if (!block.isZero() && isBlockMatchUpgId(block, minUpgId)) return true
  // if no appId provided or there is no records about appId in DB, assuming check pass
  if (!appId) return true
  const appVer = AppVersion.load(appId)
  if (!appVer) return true
  return isAppVerMatchUpgId(appId, appVer.major, minUpgId)
}

export function isLidoV2(block: BigInt = ZERO): bool {
  return checkAppVer(block, LIDO_APP_ID, PROTOCOL_UPG_IDX_V2)
}

export function isLidoTransferShares(block: BigInt = ZERO): bool {
  return checkAppVer(block, LIDO_APP_ID, PROTOCOL_UPG_IDX_V1_SHARES)
}

// export function isOracleV2(): bool {
//   return checkAppVer(ORACLE_APP_ID, UPG_V2_BETA)
// }

// export function isNORV2(): bool {
//   return checkAppVer(NOR_APP_ID, UPG_V2_BETA)
// }
