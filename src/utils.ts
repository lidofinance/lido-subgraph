import { store, crypto } from '@graphprotocol/graph-ts'
import { BigInt, Address, ByteArray } from '@graphprotocol/graph-ts'

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

/**
Temporary solution until conversion is implemented in Address:
https://github.com/graphprotocol/support/issues/40
**/

export function toChecksumAddress(address: Address): string {
  let lowerCaseAddress = address.toHex().slice(2)
  // note that this is actually a hash of the string representation of the hex without the "0x"
  let hash = crypto
    .keccak256(ByteArray.fromUTF8(address.toHex().slice(2)))
    .toHex()
    .slice(2)
  let result = '0x'

  for (let i = 0; i < lowerCaseAddress.length; i++) {
    if (parseInt(hash.charAt(i), 16) >= 8) {
      result += toUpper(lowerCaseAddress.charAt(i))
    } else {
      result += lowerCaseAddress.charAt(i)
    }
  }

  return result
}

// because there is no String.toUpper() in assemblyscript
function toUpper(str: string): string {
  let result = ''
  for (let i = 0; i < str.length; i++) {
    let charCode = str.charCodeAt(i)
    // only operate on lowercase 'a' through lower case 'z'
    if (charCode >= 97 && charCode <= 122) {
      result += String.fromCharCode(charCode - 32)
    } else {
      result += str.charAt(i)
    }
  }
  return result
}
