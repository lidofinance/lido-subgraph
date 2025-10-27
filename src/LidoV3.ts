import {
  ExternalSharesBurnt as ExternalSharesBurntEvent,
  ExternalSharesMinted as ExternalSharesMintedEvent,
  LidoV3,
} from '../generated/LidoV3/LidoV3'
import { _loadTotalsEntity } from './helpers'

export function handleExternalSharesMinted(
  event: ExternalSharesMintedEvent
): void {
  const totals = _loadTotalsEntity()!
  totals.totalShares = totals.totalShares.plus(event.params.amountOfShares)
  totals.totalPooledEther = LidoV3.bind(event.address).getTotalPooledEther()

  totals.save()
}

export function handleExternalSharesBurnt(
  event: ExternalSharesBurntEvent
): void {
  const totals = _loadTotalsEntity()!
  totals.totalPooledEther = LidoV3.bind(event.address).getTotalPooledEther()
  totals.save()
}
