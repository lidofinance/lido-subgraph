import { Bytes } from '@graphprotocol/graph-ts'
import { Totals, Shares, Stats } from '../generated/schema'
import { ZERO } from './constants'

export function _loadOrCreateStatsEntity(): Stats {
  let stats = Stats.load('')
  if (!stats) {
    stats = new Stats('')
    stats.uniqueHolders = ZERO
    stats.uniqueAnytimeHolders = ZERO
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
