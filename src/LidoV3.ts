import { BigInt } from '@graphprotocol/graph-ts'
import {
  ExternalSharesBurnt as ExternalSharesBurntEvent,
  ExternalSharesMinted as ExternalSharesMintedEvent,
} from '../generated/LidoV3/LidoV3'
import { _loadTotalsEntity } from './helpers'

export function handleExternalSharesMinted(
  event: ExternalSharesMintedEvent
): void {
  const totals = _loadTotalsEntity()!

  assert(
    totals.totalShares > BigInt.zero(),
    'external shares minted with zero totalShares'
  )

  // In V3, external shares map to pooled ether at the pre-event share rate.
  // Using tracked totals here avoids block-final eth_call state leaking in
  // later same-block Submitted events into this earlier handler.
  const pooledEtherDelta = event.params.amountOfShares
    .times(totals.totalPooledEther)
    .div(totals.totalShares)

  totals.totalPooledEther = totals.totalPooledEther.plus(pooledEtherDelta)
  totals.totalShares = totals.totalShares.plus(event.params.amountOfShares)
  totals.save()
}

export function handleExternalSharesBurnt(
  event: ExternalSharesBurntEvent
): void {
  const totals = _loadTotalsEntity()!

  assert(
    totals.totalShares > BigInt.zero(),
    'external shares burnt with zero totalShares'
  )

  const pooledEtherDelta = event.params.amountOfShares
    .times(totals.totalPooledEther)
    .div(totals.totalShares)

  assert(
    totals.totalPooledEther >= pooledEtherDelta,
    'external shares burnt exceed totalPooledEther'
  )

  totals.totalPooledEther = totals.totalPooledEther.minus(pooledEtherDelta)
  totals.save()
}
