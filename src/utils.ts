import { store } from '@graphprotocol/graph-ts'
import { BigInt } from '@graphprotocol/graph-ts'

export function guessOracleRunsTotal(currentblockTime: BigInt): i32 {
  // We know when first Oracle report happened
  let oracleFirstReportBlockTime = 1610016625
  // Convert it to full days
  let oracleFirstdDaySinceEpoch = <i32>(
    Math.floor(oracleFirstReportBlockTime / 60 / 60 / 24)
  )
  // Convert input argument to full days
  let fullDaysSinceEpoch = <i32>(
    Math.floor(currentblockTime.toI32() / 60 / 60 / 24)
  )

  let probableId = fullDaysSinceEpoch - oracleFirstdDaySinceEpoch

  // If there were any transfers before first oracle report, then number would be negative
  if (probableId < 0) {
    return 0
  }

  // Our estimation is not 100% - needs a buffer
  return probableId + 10
}

export function nextIncrementalId(entityName: string, i: i32): string {
  // Try to load entity with this id
  let entity = store.get(entityName, i.toString())

  if (entity) {
    let nextItem = i + 1
    return nextItem.toString()
  } else if (i == 0) {
    return '0'
  } else {
    return nextIncrementalId(entityName, i - 1)
  }
}

export function lastIncrementalId(entityName: string, i: i32): string {
  // Try to load entity with this id
  let entity = store.get(entityName, i.toString())

  if (entity) {
    return i.toString()
  } else if (i == 0) {
    return null
  } else {
    return lastIncrementalId(entityName, i - 1)
  }
}
