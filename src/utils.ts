import { store } from "@graphprotocol/graph-ts";
import { BigInt } from "@graphprotocol/graph-ts";

export function guessOracleRunsTotal(currentblockTime: BigInt): i32 {
  // We know when first Oracle report happened
  let oracleFirstReportBlockTime = 1610016625;
  // Convert it to full days
  let oracleFirstdDaySinceEpoch = <i32>(
    Math.floor(oracleFirstReportBlockTime / 60 / 60 / 24)
  );
  // Convert input argument to full days
  let fullDaysSinceEpoch = <i32>(
    Math.floor(currentblockTime.toI32() / 60 / 60 / 24)
  );

  let probableId = fullDaysSinceEpoch - oracleFirstdDaySinceEpoch;

  // If there were any transfers before first oracle report, then number would be negative
  if (probableId < 0) {
    return 0;
  }

  return probableId;
}

export function nextIncrementalId(entity: string, i: i32): string {
  // Try to load entity with this id
  let x = store.get(entity, i.toString());

  if (x) {
    let nextItem = i + 1;
    return nextItem.toString();
  } else if (i == 0) {
    return "0";
  } else {
    return nextIncrementalId(entity, i - 1);
  }
}

export function lastIncrementalId(entity: string, i: i32): string {
  // Try to load entity with this id
  let x = store.get(entity, i.toString());

  if (x) {
    return i.toString();
  } else if (i == 0) {
    return null;
  } else {
    return lastIncrementalId(entity, i - 1);
  }
}
