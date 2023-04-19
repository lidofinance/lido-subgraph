import { Address, BigInt, Bytes, ethereum, log } from '@graphprotocol/graph-ts'
import { parserMap } from '../generated/parserData'
import { ZERO, ZERO_ADDRESS } from './constants'

export class ParsedEvent {
  constructor(public name: string, public event: ethereum.Event) {}
}

export function parseEventLogs(
  baseEvent: ethereum.Event,
  contractAddress: Address = ZERO_ADDRESS,
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
        (!logIndexTo.isZero() && receipt.logs[i].logIndex > logIndexTo) ||
        (contractAddress != ZERO_ADDRESS && receipt.logs[i].address != contractAddress)
      ) {
        continue
      }
      const eventParserOpts = parserMap.get(receipt.logs[i].topics[0])
      if (eventParserOpts) {
        const name = eventParserOpts[0]
        const params = eventParserOpts.slice(1)
        const event = new ethereum.Event(
          receipt.logs[i].address,
          receipt.logs[i].logIndex,
          receipt.logs[i].transactionLogIndex,
          receipt.logs[i].logType,
          baseEvent.block,
          baseEvent.transaction,
          new Array(params.length),
          null
        )
        const notIndexedParams: string[] = []
        const notIndexedParamsMap: i32[] = []
        let topicIdx = 1
        for (let j = 0; j < params.length; ++j) {
          const type = params[j].split(' ')
          // if (params[j].slice(-7) == ' indexed') {
          if (type.length > 1 && type[1] == 'indexed') {
            const decoded = ethereum.decode(
              type[0],
              receipt.logs[i].topics[topicIdx++]
            )
            event.parameters[j] = new ethereum.EventParam('', decoded!)
          } else {
            notIndexedParams.push(type[0])
            notIndexedParamsMap.push(j)
          }
        }
        if (notIndexedParamsMap.length > 0) {
          const decoded = ethereum.decode(
            '(' + notIndexedParams.join(',') + ')',
            receipt.logs[i].data
          )
          const tuple = decoded!.toTuple()
          for (let k = 0; k < tuple.length; k++) {
            event.parameters[notIndexedParamsMap[k]] = new ethereum.EventParam(
              '',
              tuple[k]
            )
          }
        }
        events.push(new ParsedEvent(name, event))
      } else {
        log.warning('eventParserOpts not found! topic0: {}', [receipt.logs[i].topics[0].toHexString()])
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
