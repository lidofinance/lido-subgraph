import { BigInt, Address, TypedMap } from '@graphprotocol/graph-ts'
import { dataSource } from '@graphprotocol/graph-ts'

export const ZERO = BigInt.fromI32(0)

export const CALCULATION_UNIT = BigInt.fromI32(10000)

export const WEI = BigInt.fromString('1000000000000000000')

export const DEPOSIT_SIZE = BigInt.fromI32(32)
export const DEPOSIT_AMOUNT = DEPOSIT_SIZE.times(WEI)

export const DUST_BOUNDARY = BigInt.fromI32(50000)

const LIDO_ADDRESSES = new TypedMap<string, string>()
LIDO_ADDRESSES.set('mainnet', '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84')
LIDO_ADDRESSES.set('goerli', '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F')

const NOS_ADDRESSES = new TypedMap<string, string>()
NOS_ADDRESSES.set('mainnet', '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5')
NOS_ADDRESSES.set('goerli', '0x9D4AF1Ee19Dad8857db3a45B0374c81c8A1C6320')

const TREASURY_ADDRESSES = new TypedMap<string, string>()
TREASURY_ADDRESSES.set('mainnet', '0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c')
TREASURY_ADDRESSES.set('goerli', '0x4333218072D5d7008546737786663c38B4D561A4')

let network = dataSource.network()

export const getAddress = (contract: string): Address =>
  Address.fromString(
    (contract == 'Lido'
      ? LIDO_ADDRESSES.get(network)
      : contract == 'NodeOperatorsRegistry'
      ? NOS_ADDRESSES.get(network)
      : contract == 'Treasury'
      ? TREASURY_ADDRESSES.get(network)
      : null)!
  )
