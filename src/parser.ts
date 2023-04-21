import { Address, BigInt, Bytes, ethereum, log } from '@graphprotocol/graph-ts'
import { parserMap } from '../generated/parserData'
import { ZERO, ZERO_ADDRESS } from './constants'

export class ParsedEvent {
  constructor(public name: string, public event: ethereum.Event) {}
}

export function parseEventLogs(
  baseEvent: ethereum.Event,
  contractAddress: Address = ZERO_ADDRESS,
  logIndexFrom: BigInt = ZERO,
  logIndexTo: BigInt = ZERO
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
            const decoded = ethereum.decode(type[0], receipt.logs[i].topics[topicIdx++])
            event.parameters[j] = new ethereum.EventParam('', decoded!)
          } else {
            notIndexedParams.push(type[0])
            notIndexedParamsMap.push(j)
          }
        }
        let decodeFinished = notIndexedParamsMap.length == 0
        if (!decodeFinished) {
          const decoded = ethereum.decode('(' + notIndexedParams.join(',') + ')', receipt.logs[i].data)
          if (!decoded) {
            log.warning('params decode fai for event: {} tuple: {} data: {} block: {} txHash: {} logIdx: {}', [
              eventParserOpts[0],
              notIndexedParams.join(','),
              receipt.logs[i].data.toHexString(),
              baseEvent.block.number.toString(),
              baseEvent.transaction.hash.toHexString(),
              receipt.logs[i].logIndex.toString()
            ])
          } else {
            const tuple = decoded.toTuple()
            for (let k = 0; k < notIndexedParamsMap.length; k++) {
              event.parameters[notIndexedParamsMap[k]] = new ethereum.EventParam('', tuple[k])
            }
            decodeFinished = true
          }
        }
        if (decodeFinished) {
          events.push(new ParsedEvent(name, event))
        }
      } else {
        log.warning('eventParserOpts not found for topic0: {} block: {} txHash: {} logIdx: {}', [
          receipt.logs[i].topics[0].toHexString(),
          baseEvent.block.number.toString(),
          baseEvent.transaction.hash.toHexString(),
          receipt.logs[i].logIndex.toString()
        ])
      }
    }
  }
  return events
}


export function extractPairedEvent(
  events: ParsedEvent[],
  leftName: string,
  rightName: string,
  logIndexFrom: BigInt = ZERO,
  logIndexTo: BigInt = ZERO
): ParsedEvent[][] {
  let eventPairs: ParsedEvent[][] = []
  // 1 based index
  let idx0 = 0
  let idx1 = 0

  for (let i = 0; i < events.length; i++) {
    if (
      (!logIndexFrom.isZero() && events[i].event.logIndex < logIndexFrom) ||
      (!logIndexTo.isZero() && events[i].event.logIndex > logIndexTo)
    ) {
      continue
    }

    if (events[i].name == leftName && !idx0) {
      idx0 = i + 1
      if (!idx1) {
        continue
      }
    }
    if (events[i].name == rightName && !idx1) {
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
      log.error('Pair not found for events <{}, {}>', [leftName, rightName])
      throw new Error('Pair event missed')
    }
    // eventPairs.push([events[i]])
  }

  return eventPairs
}


export function getRightPairedEventByLeftLogIndex<T>(events: ParsedEvent[][], logIndex: BigInt): T | null {
  for (let i = 0; i < events.length; i++) {
    if (events[i][0].event.logIndex == logIndex) {
      return getParsedEvent<T>(events[i], 1)
    }
  }
  return null
}

export function getParsedEvent<T>(events: ParsedEvent[], pos: i32 = 0): T {
  return changetype<T>(events[pos].event)
}

export function getParsedEventByName<T>(
  events: ParsedEvent[],
  name: string,
  logIndexFrom: BigInt = ZERO,
  logIndexTo: BigInt = ZERO
): T | null {
  for (let i = 0; i < events.length; i++) {
    if (
      (logIndexFrom.isZero() || events[i].event.logIndex >= logIndexFrom) &&
      (logIndexTo.isZero() || events[i].event.logIndex <= logIndexTo) &&
      events[i].name == name
    ) {
      return changetype<T>(events[i].event)
    }
  }
  return null
}
