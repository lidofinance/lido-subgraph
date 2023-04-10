import { store, Bytes, ethereum, BigInt } from '@graphprotocol/graph-ts'
import {
  Totals,
  Shares,
  Stats,
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
  eventTransfer: Transfer,
  eventTransferShares: TransferShares
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
    entity.shares = eventTransferShares.params.sharesValue
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

export function _loadOrCreateStatsEntity(): Stats {
  let stats = Stats.load('')
  if (!stats) {
    stats = new Stats('')
    stats.uniqueHolders = ZERO
    stats.uniqueAnytimeHolders = ZERO
    stats.lastOracleCompletedId = ZERO
    stats.save()
  }
  return stats
}

export function _loadOrCreateTotalsEntity(): Totals {
  let totals = Totals.load('')
  if (!totals) {
    totals = new Totals('')
    totals.totalPooledEther = ZERO
    totals.totalShares = ZERO
  }
  return totals
}

export function _loadOrCreateSharesEntity(id: Bytes): Shares {
  let sharesEntity = Shares.load(id)
  if (!sharesEntity) {
    sharesEntity = new Shares(id)
    sharesEntity.shares = ZERO
  }
  return sharesEntity
}

export function _updateTransferShares(entity: LidoTransfer): void {
  // No point in changing 0x0 shares
  if (!entity.shares.isZero()) {
    // Decreasing from address shares
    if (entity.from != ZERO_ADDRESS) {
      // Address must already have shares, HOWEVER:
      // Someone can and managed to produce events of 0 to 0 transfers
      let sharesFromEntity = _loadOrCreateSharesEntity(entity.from)

      entity.sharesBeforeDecrease = sharesFromEntity.shares
      sharesFromEntity.shares = sharesFromEntity.shares.minus(entity.shares)
      entity.sharesAfterDecrease = sharesFromEntity.shares

      sharesFromEntity.save()

      // Calculating new balance
      entity.balanceAfterDecrease = entity
        .sharesAfterDecrease!.times(entity.totalPooledEther)
        .div(entity.totalShares)
    }

    // Increasing to address shares
    if (entity.to != ZERO_ADDRESS) {
      let sharesToEntity = _loadOrCreateSharesEntity(entity.to)

      entity.sharesBeforeIncrease = sharesToEntity.shares
      sharesToEntity.shares = sharesToEntity.shares.plus(entity.shares)
      entity.sharesAfterIncrease = sharesToEntity.shares

      sharesToEntity.save()

      // Calculating new balance
      entity.balanceAfterIncrease = entity
        .sharesAfterIncrease!.times(entity.totalPooledEther)
        .div(entity.totalShares)
    }
  }
}

export function _updateHolders(entity: LidoTransfer): void {
  // Saving recipient address as a unique stETH holder
  if (!entity.shares.isZero()) {
    let stats = _loadOrCreateStatsEntity()
    let isNewHolder = false
    let holder: Holder | null
    // skip zero destination for any case
    if (entity.to != ZERO_ADDRESS) {
      holder = Holder.load(entity.to)
      isNewHolder = !holder
      if (isNewHolder) {
        holder = new Holder(entity.to)
        holder.address = entity.to
        holder.save()
      }
    }

    if (isNewHolder) {
      stats.uniqueHolders = stats.uniqueHolders.plus(ONE)
      stats.uniqueAnytimeHolders = stats.uniqueAnytimeHolders.plus(ONE)
    } else if (
      entity.from != ZERO_ADDRESS &&
      entity.sharesAfterDecrease!.isZero()
    ) {
      // Mints don't have balanceAfterDecrease
      stats.uniqueHolders = stats.uniqueHolders.minus(ONE)
      // @todo delete holder
      // @todo check id correctness
      // store.remove('Holder', entity.from.toString())
    }
    stats.save()
  }
}

// export function _loadOrCreateCounters(): Counters {
//   let counters = Counters.load('')
//   if (!counters) {
//     counters = new Counters('')
//     counters.lastOracleCompletedId = ZERO
//     counters.save()
//   }
//   return counters
// }


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
