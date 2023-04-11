import { store, Bytes, ethereum, BigInt, log } from '@graphprotocol/graph-ts'
import {
  Total,
  Share,
  Stat,
  LidoTransfer,
  TotalReward,
  Holder,
  OracleReport,
  AppVersion
} from '../generated/schema'
import {
  LIDO_APP_ID,
  NOR_APP_ID,
  ONE,
  ORACLE_APP_ID,
  UPG_V2_BETA,
  ZERO,
  ZERO_ADDRESS,
  isAppVerMatch
} from './constants'
import { Transfer, TransferShares } from '../generated/Lido/Lido'

export function _loadOrCreateLidoTransferEntity(
  eventTransfer: Transfer
): LidoTransfer {
  let id =
    eventTransfer.transaction.hash.toHex() +
    '-' +
    eventTransfer.logIndex.toString()
  let entity = LidoTransfer.load(id)
  if (!entity) {
    entity = new LidoTransfer(id)
    entity.from = eventTransfer.params.from
    entity.to = eventTransfer.params.to
    entity.block = eventTransfer.block.number
    entity.blockTime = eventTransfer.block.timestamp
    entity.transactionHash = eventTransfer.transaction.hash
    entity.transactionIndex = eventTransfer.transaction.index
    entity.logIndex = eventTransfer.logIndex
    entity.transactionLogIndex = eventTransfer.transactionLogIndex

    entity.value = eventTransfer.params.value
    entity.shares = ZERO
    entity.totalPooledEther = ZERO
    entity.totalShares = ZERO

    entity.balanceAfterDecrease = ZERO
    entity.balanceAfterIncrease = ZERO
    entity.sharesBeforeDecrease = ZERO
    entity.sharesAfterDecrease = ZERO
    entity.sharesBeforeDecrease = ZERO
    entity.sharesAfterIncrease = ZERO
    entity.mintWithoutSubmission = false
  }
  return entity
}

export function _loadOrCreateOracleReport(refSLot: BigInt): OracleReport {
  let entity = OracleReport.load(refSLot.toString())
  if (!entity) {
    entity = new OracleReport(refSLot.toString())
  }
  entity.itemsProcessed = ZERO
  entity.itemsCount = ZERO

  return entity
}

export function _loadOrCreateTotalRewardEntity(
  event: ethereum.Event
): TotalReward {
  let entity = TotalReward.load(event.transaction.hash)
  if (!entity) {
    entity = new TotalReward(event.transaction.hash)

    entity.block = event.block.number
    entity.blockTime = event.block.timestamp
    entity.transactionIndex = event.transaction.index
    entity.logIndex = event.logIndex
    entity.transactionLogIndex = event.transactionLogIndex

    entity.feeBasis = ZERO
    entity.treasuryFeeBasisPoints = ZERO
    entity.insuranceFeeBasisPoints = ZERO
    entity.operatorsFeeBasisPoints = ZERO

    entity.totalRewardsWithFees = ZERO
    entity.totalRewards = ZERO
    entity.totalFee = ZERO
    entity.operatorsFee = ZERO

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

export function _loadOrCreateStatsEntity(): Stat {
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

export function _loadOrCreateTotalsEntity(): Total {
  let totals = Total.load('')
  if (!totals) {
    totals = new Total('')
    totals.totalPooledEther = ZERO
    totals.totalShares = ZERO
  }
  return totals
}

export function _loadOrCreateSharesEntity(id: Bytes): Share {
  let sharesEntity = Share.load(id)
  if (!sharesEntity) {
    sharesEntity = new Share(id)
    sharesEntity.shares = ZERO
  }
  return sharesEntity
}

export function _updateTransferBalances(entity: LidoTransfer): void {
  if (entity.totalShares.isZero()) {
    entity.balanceAfterIncrease = entity.value
    entity.balanceAfterDecrease = ZERO
  } else {
    entity.balanceAfterIncrease = entity
      .sharesAfterIncrease!.times(entity.totalPooledEther)
      .div(entity.totalShares)
    entity.balanceAfterDecrease = entity
      .sharesAfterDecrease!.times(entity.totalPooledEther)
      .div(entity.totalShares)
  }
}

export function _updateTransferShares(entity: LidoTransfer): void {
  // Decreasing from address shares
  if (entity.from != ZERO_ADDRESS) {
    // Address must already have shares, HOWEVER:
    // Someone can and managed to produce events of 0 to 0 transfers
    const sharesFromEntity = _loadOrCreateSharesEntity(entity.from)
    entity.sharesBeforeDecrease = sharesFromEntity.shares

    if (entity.from != entity.to) {
      assert(
        sharesFromEntity.shares >= entity.shares,
        'Abnormal shares decrease!'
      )
      sharesFromEntity.shares = sharesFromEntity.shares.minus(entity.shares)
      sharesFromEntity.save()
    }
    entity.sharesAfterDecrease = sharesFromEntity.shares
  }
  // Increasing to address shares
  if (entity.to != ZERO_ADDRESS) {
    const sharesToEntity = _loadOrCreateSharesEntity(entity.to)
    entity.sharesBeforeIncrease = sharesToEntity.shares
    if (entity.to != entity.from) {
      sharesToEntity.shares = sharesToEntity.shares.plus(entity.shares)
      sharesToEntity.save()
    }
    entity.sharesAfterIncrease = sharesToEntity.shares
  }
}

export function _updateHolders(entity: LidoTransfer): void {
  // Saving recipient address as a unique stETH holder
  const stats = _loadOrCreateStatsEntity()

  // skip zero destination for any case
  if (entity.to != ZERO_ADDRESS && !entity.balanceAfterIncrease!.isZero()) {
    let holder = Holder.load(entity.to)
    if (!holder) {
      holder = new Holder(entity.to)
      // @todo remove
      holder.address = entity.to
      holder.balance = ZERO

      stats.uniqueAnytimeHolders = stats.uniqueAnytimeHolders.plus(ONE)
    }
    if (holder.balance.isZero()) {
      stats.uniqueHolders = stats.uniqueHolders.plus(ONE)
    }
    holder.balance = entity.balanceAfterIncrease!
    holder.save()
  }

  if (entity.from != ZERO_ADDRESS) {
    const holder = Holder.load(entity.from)
    if (holder) {
      if (!holder.balance.isZero() && entity.balanceAfterDecrease!.isZero()) {
        stats.uniqueHolders = stats.uniqueHolders.minus(ONE)
      }
      holder.balance = entity.balanceAfterDecrease!
      holder.save()
      // @todo delete holder
      // @todo check id correctness
      // store.remove('Holder', entity.from.toString())
    } // else should not be
  }
  stats.save()
}

export const checkAppVer = (appId: Bytes, minUpgId: i32): bool => {
  const appVer = AppVersion.load(appId)
  if (!appVer) return false
  return isAppVerMatch(appId, appVer.major, minUpgId)
}

export function isLidoV2(): bool {
  return checkAppVer(LIDO_APP_ID, UPG_V2_BETA)
}

export function isOracleV2(): bool {
  return checkAppVer(ORACLE_APP_ID, UPG_V2_BETA)
}

export function isNORV2(): bool {
  return checkAppVer(NOR_APP_ID, UPG_V2_BETA)
}
