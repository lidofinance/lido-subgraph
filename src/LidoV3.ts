import { BigInt, log } from '@graphprotocol/graph-ts'
import {
  ExternalBadDebtInternalized as ExternalBadDebtInternalizedEvent,
  ExternalEtherTransferredToBuffer as ExternalEtherTransferredToBufferEvent,
  ExternalSharesBurnt as ExternalSharesBurntEvent,
  ExternalSharesMinted as ExternalSharesMintedEvent,
  SharesBurnt as SharesBurntEvent,
  Transfer as TransferEvent,
  TransferShares as TransferSharesEvent,
} from '../generated/LidoV3/LidoV3'
import { ZERO, ZERO_ADDRESS } from './constants'
import { _loadTotalsEntity } from './helpers'
import {
  extractPairedEvent,
  getParsedEvent,
  ParsedEvent,
  parseEventLogs,
} from './parser'

function getMintTransferValue(
  event: ExternalSharesMintedEvent,
  parsedEvents: ParsedEvent[]
): BigInt {
  const transferEventPairs = extractPairedEvent(
    parsedEvents,
    'Transfer',
    'TransferShares',
    ZERO,
    event.logIndex
  )

  for (let i = transferEventPairs.length - 1; i >= 0; i--) {
    const transferEvent = getParsedEvent<TransferEvent>(transferEventPairs[i], 0)
    const transferSharesEvent = getParsedEvent<TransferSharesEvent>(
      transferEventPairs[i],
      1
    )

    if (
      transferEvent.params.from == ZERO_ADDRESS &&
      transferEvent.params.to == event.params.receiver &&
      transferSharesEvent.params.sharesValue == event.params.amountOfShares
    ) {
      return transferEvent.params.value
    }
  }

  assert(false, 'matching Transfer/TransferShares not found for ExternalSharesMinted')
  return ZERO
}

function findMatchingSharesBurnt(
  event: ExternalSharesBurntEvent,
  parsedEvents: ParsedEvent[]
): SharesBurntEvent | null {
  for (let i = parsedEvents.length - 1; i >= 0; i--) {
    if (
      parsedEvents[i].event.logIndex < event.logIndex &&
      parsedEvents[i].name == 'SharesBurnt'
    ) {
      const sharesBurntEvent = changetype<SharesBurntEvent>(parsedEvents[i].event)
      if (sharesBurntEvent.params.sharesAmount == event.params.amountOfShares) {
        return sharesBurntEvent
      }
    }
  }
  return null
}

function findMatchingBufferTransfer(
  event: ExternalSharesBurntEvent,
  parsedEvents: ParsedEvent[]
): ExternalEtherTransferredToBufferEvent | null {
  for (let i = parsedEvents.length - 1; i >= 0; i--) {
    if (
      parsedEvents[i].event.logIndex < event.logIndex &&
      parsedEvents[i].name == 'ExternalEtherTransferredToBuffer'
    ) {
      return changetype<ExternalEtherTransferredToBufferEvent>(
        parsedEvents[i].event
      )
    }
  }
  return null
}

function findMatchingBadDebtInternalized(
  event: ExternalSharesBurntEvent,
  parsedEvents: ParsedEvent[]
): ExternalBadDebtInternalizedEvent | null {
  for (let i = parsedEvents.length - 1; i >= 0; i--) {
    if (
      parsedEvents[i].event.logIndex < event.logIndex &&
      parsedEvents[i].name == 'ExternalBadDebtInternalized'
    ) {
      const badDebtEvent = changetype<ExternalBadDebtInternalizedEvent>(
        parsedEvents[i].event
      )
      if (badDebtEvent.params.amountOfShares == event.params.amountOfShares) {
        return badDebtEvent
      }
    }
  }
  return null
}

export function handleExternalSharesMinted(
  event: ExternalSharesMintedEvent
): void {
  const totals = _loadTotalsEntity()!
  const parsedEvents = parseEventLogs(event, event.address)
  const pooledEtherDelta = getMintTransferValue(event, parsedEvents)

  totals.totalPooledEther = totals.totalPooledEther.plus(pooledEtherDelta)
  totals.totalShares = totals.totalShares.plus(event.params.amountOfShares)
  totals.save()
}

export function handleExternalSharesBurnt(
  event: ExternalSharesBurntEvent
): void {
  const totals = _loadTotalsEntity()!
  const parsedEvents = parseEventLogs(event, event.address)

  const sharesBurntEvent = findMatchingSharesBurnt(event, parsedEvents)
  if (sharesBurntEvent) {
    assert(
      totals.totalPooledEther >= sharesBurntEvent.params.preRebaseTokenAmount,
      'external shares burnt exceed totalPooledEther'
    )

    totals.totalPooledEther = totals.totalPooledEther.minus(
      sharesBurntEvent.params.preRebaseTokenAmount
    )
    totals.save()
    return
  }

  const bufferTransferEvent = findMatchingBufferTransfer(event, parsedEvents)
  if (bufferTransferEvent) {
    assert(
      totals.totalShares > BigInt.zero(),
      'external shares rebalance with zero totalShares'
    )

    const externalEtherDelta = event.params.amountOfShares
      .times(totals.totalPooledEther)
      .div(totals.totalShares)

    totals.totalPooledEther = totals.totalPooledEther
      .plus(bufferTransferEvent.params.amount)
      .minus(externalEtherDelta)
    totals.save()
    return
  }

  const badDebtEvent = findMatchingBadDebtInternalized(event, parsedEvents)
  if (badDebtEvent) {
    log.warning(
      'ExternalBadDebtInternalized detected, pooled ether sync deferred to ETHDistributed tx={} logIndex={}',
      [event.transaction.hash.toHexString(), event.logIndex.toString()]
    )
    return
  }

  assert(false, 'unsupported ExternalSharesBurnt path')
}
