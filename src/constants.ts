import { BigInt, Address, TypedMap, Bytes } from '@graphprotocol/graph-ts'
import { dataSource } from '@graphprotocol/graph-ts'

import { Settings } from '../generated/schema'

const network = dataSource.network()
const isMainnet = network == 'mainnet'

/**
Units
**/

export const ZERO = BigInt.fromI32(0)
export const ONE = BigInt.fromI32(1)

export const CALCULATION_UNIT = BigInt.fromI32(10000)

// 1 ETH in WEI
export const ETHER = BigInt.fromString('1000000000000000000')

/**
Deposits
**/

export const DEPOSIT_SIZE = BigInt.fromI32(32)
export const DEPOSIT_AMOUNT = DEPOSIT_SIZE.times(ETHER) // in Wei

/**
Addresses
**/

export const ZERO_ADDRESS = Address.fromString(
  '0x0000000000000000000000000000000000000000'
)

const LIDO_ADDRESSES = new TypedMap<string, string>()
LIDO_ADDRESSES.set('mainnet', '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84')
LIDO_ADDRESSES.set('goerli', '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F')

const NOS_ADDRESSES = new TypedMap<string, string>()
NOS_ADDRESSES.set('mainnet', '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5')
NOS_ADDRESSES.set('goerli', '0x9D4AF1Ee19Dad8857db3a45B0374c81c8A1C6320')

const TREASURY_ADDRESSES = new TypedMap<string, string>()
TREASURY_ADDRESSES.set('mainnet', '0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c')
TREASURY_ADDRESSES.set('goerli', '0x4333218072D5d7008546737786663c38B4D561A4')

// We presume here that initially insurance fund was the treasury
const getInsuranceFund = (): string =>
  Settings.load('')
    ? Settings.load('')!.insuranceFund.toHex()
    : TREASURY_ADDRESSES.get(network)!

export const getAddress = (contract: string): Address =>
  Address.fromString(
    (contract == 'Lido'
      ? LIDO_ADDRESSES.get(network)
      : contract == 'NodeOperatorsRegistry'
      ? NOS_ADDRESSES.get(network)
      : contract == 'Insurance Fund'
      ? getInsuranceFund()
      : contract == 'Treasury'
      ? TREASURY_ADDRESSES.get(network)
      : null)!
  )

/**
 * Aragon Apps
 **/

export const KERNEL_APP_BASES_NAMESPACE = Bytes.fromHexString(
  '0xf1f3eb40f5bc1ad1344716ced8b8a0431d840b5783aea1fd01786bc26f35ac0f'
)

// Lido App
export const LIDO_APP_ID = Bytes.fromHexString(
  '0x79ac01111b462384f1b7fba84a17b9ec1f5d2fddcfcb99487d71b443832556ea'
)
const LIDO_REPO = new TypedMap<string, string>()
LIDO_REPO.set('mainnet', '0xF5Dc67E54FC96F993CD06073f71ca732C1E654B1')
LIDO_REPO.set('goerli', '0xE9eDe497d2417fd980D8B5338232666641B9B9aC')

// NOR App
export const NOR_APP_ID = Bytes.fromHexString(
  '0x57384c8fcaf2c1c2144974769a6ea4e5cf69090d47f5327f8fc93827f8c0001a'
)
const NOR_REPO = new TypedMap<string, string>()
NOR_REPO.set('mainnet', '0x0D97E876ad14DB2b183CFeEB8aa1A5C788eB1831')
NOR_REPO.set('goerli', '0x5F867429616b380f1Ca7a7283Ff18C53a0033073')

// Oracle App
export const ORACLE_APP_ID = Bytes.fromHexString(
  '0xb2977cfc13b000b6807b9ae3cf4d938f4cc8ba98e1d68ad911c58924d6aa4f11'
)
const ORACLE_REPO = new TypedMap<string, string>()
ORACLE_REPO.set('mainnet', '0xF9339DE629973c60c4d2b76749c81E6F40960E3A')
ORACLE_REPO.set('goerli', '0x9234e37Adeb44022A078557D9943b72AB89bF36a')

export const getRepoAddr = (appId: Bytes): string | null =>
  appId == LIDO_APP_ID
    ? LIDO_REPO.get(network)
    : appId == NOR_APP_ID
    ? NOR_REPO.get(network)
    : appId == ORACLE_APP_ID
    ? ORACLE_REPO.get(network)
    : null
