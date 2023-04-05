import { BigInt, ethereum, log } from '@graphprotocol/graph-ts'
import { parserMap } from '../generated/parserData'

export class ParsedEvent {
  constructor(public name: string, public event: ethereum.Event) {}
}

export function parseEventLogs(
  baseEvent: ethereum.Event,
  logIndexFrom: BigInt = BigInt.fromI32(0),
  logIndexTo: BigInt = BigInt.fromI32(0)
): ParsedEvent[] {
  const events: ParsedEvent[] = []

  let receipt = baseEvent.receipt
  if (receipt && receipt.logs.length > 1) {
    for (let i = 0; i < receipt.logs.length; i++) {
      // skip events out of indexes range
      if (
        (!logIndexFrom.isZero() && receipt.logs[i].logIndex < logIndexFrom) ||
        (!logIndexTo.isZero() && receipt.logs[i].logIndex > logIndexTo)
      ) {
        continue
      }
      let eventParserOpts = parserMap.get(receipt.logs[i].topics[0])
      if (eventParserOpts) {
        let event = new ethereum.Event(
          receipt.logs[i].address,
          receipt.logs[i].logIndex,
          receipt.logs[i].transactionLogIndex,
          receipt.logs[i].logType,
          baseEvent.block,
          baseEvent.transaction,
          [],
          null
        )
        event.parameters = new Array()
        let decoded = ethereum.decode(eventParserOpts[1], receipt.logs[i].data)
        if (decoded) {
          let tuple = decoded.toTuple()
          for (let k = 0; k < tuple.length; k++) {
            event.parameters.push(new ethereum.EventParam('', tuple[k]))
          }
        }
        events.push(new ParsedEvent(eventParserOpts[0], event))
      }
    }
  }
  return events
}

export function extractPairedEvent(
  events: ParsedEvent[],
  pairNames: string[]
): ParsedEvent[][] {
  let eventPairs: ParsedEvent[][] = []
  // 1 based index
  let idx0 = 0
  let idx1 = 0

  for (let i = 0; i < events.length; i++) {
    if (events[i].name == pairNames[0] && !idx0) {
      idx0 = i + 1
      if (!idx1) {
        continue
      }
    }
    if (events[i].name == pairNames[1] && !idx1) {
      idx1 = i + 1
      if (!idx0) {
        continue
      }
    }

    if (idx0 && idx1) {
      eventPairs.push([events[idx0 - 1], events[idx1 - 1]])
      idx0 = 0
      idx1 = 0
    } else if ((idx0 && !idx1) || (idx1 && !idx0)) {
      log.error('Pair not found for events <{}, {}>', pairNames)
      throw new Error('Pair event missed')
    }
    // eventPairs.push([events[i]])
  }

  return eventPairs
}

export function filterParsedEventsByLogIndexRange(
  events: ParsedEvent[],
  logIndexFrom: BigInt,
  logIndexTo: BigInt
): ParsedEvent[] {
  let filtered: ParsedEvent[] = []

  for (let i = 0; i < events.length; i++) {
    if (
      events[i].event.logIndex >= logIndexFrom &&
      events[i].event.logIndex <= logIndexTo
    ) {
      filtered.push(events[i])
    }
  }
  return filtered
}

export function findParsedEventByName(
  events: ParsedEvent[],
  name: string
): ParsedEvent | null {
  for (let i = 0; i < events.length; i++) {
    if (events[i].name == name) {
      return events[i]
    }
  }
  return null
}

export function filterPairedEventsByLogIndexRange(
  events: ParsedEvent[][],
  logIndexFrom: BigInt,
  logIndexTo: BigInt
): ParsedEvent[][] {
  let filtered: ParsedEvent[][] = []

  for (let i = 0; i < events.length; i++) {
    if (
      events[i][0].event.logIndex >= logIndexFrom &&
      events[i][0].event.logIndex <= logIndexTo
    ) {
      filtered.push(events[i])
    }
  }
  return filtered
}

export function findPairedEventByLogIndex(
  events: ParsedEvent[][],
  logIndex: BigInt
): ParsedEvent[] | null {
  for (let i = 0; i < events.length; i++) {
    if (events[i][0].event.logIndex == logIndex) {
      return events[i]
    }
  }
  return null
}
