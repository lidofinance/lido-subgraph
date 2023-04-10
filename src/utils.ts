import { store, crypto } from '@graphprotocol/graph-ts'
import { BigInt, Address, ByteArray } from '@graphprotocol/graph-ts'

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
