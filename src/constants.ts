import {
  BigInt,
  Address,
  TypedMap,
  Bytes,
  dataSource,
} from '@graphprotocol/graph-ts'
import { LidoConfig } from '../generated/schema'

export const network = dataSource.network()

/**
Units
**/

export const ZERO = BigInt.fromI32(0)
export const ONE = BigInt.fromI32(1)

export const CALCULATION_UNIT = BigInt.fromI32(10000)
export const ONE_HUNDRED_PERCENT = BigInt.fromI32(100).toBigDecimal()
export const E27_PRECISION_BASE = BigInt.fromString(
  '1000000000000000000000000000'
).toBigDecimal()
export const SECONDS_PER_YEAR = BigInt.fromI32(60 * 60 * 24 * 365)

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
LIDO_ADDRESSES.set('hoodi', '0x3508A952176b3c15387C97BE809eaffB1982176a')

const NOS_ADDRESSES = new TypedMap<string, string>()
NOS_ADDRESSES.set('mainnet', '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5')
NOS_ADDRESSES.set('hoodi', '0x5cDbE1590c083b5A2A64427fAA63A7cfDB91FbB5')

const TREASURY_ADDRESSES = new TypedMap<string, string>()
TREASURY_ADDRESSES.set('mainnet', '0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c')
TREASURY_ADDRESSES.set('hoodi', '0x0534aA41907c9631fae990960bCC72d75fA7cfeD')

const SR_ADDRESSES = new TypedMap<string, string>()
SR_ADDRESSES.set('mainnet', '0xFdDf38947aFB03C621C71b06C9C70bce73f12999')
SR_ADDRESSES.set('hoodi', '0xCc820558B39ee15C7C45B59390B503b83fb499A8')

const BURNER_ADDRESSES = new TypedMap<string, string>()
BURNER_ADDRESSES.set('mainnet', '0xD15a672319Cf0352560eE76d9e89eAB0889046D3')
BURNER_ADDRESSES.set('hoodi', '0x4e9A9ea2F154bA34BE919CD16a4A953DCd888165')

const ACCOUNTING_ORACLE_ADDRESSES = new TypedMap<string, string>()
ACCOUNTING_ORACLE_ADDRESSES.set(
  'mainnet',
  '0x852deD011285fe67063a08005c71a85690503Cee'
)
ACCOUNTING_ORACLE_ADDRESSES.set(
  'hoodi',
  '0xcb883B1bD0a41512b42D2dB267F2A2cd919FB216'
)

// We presume here that initially insurance fund was the treasury
const getInsuranceFund = (): string => {
  const cfg = LidoConfig.load('')
  return cfg && cfg.insuranceFund
    ? cfg.insuranceFund!.toHex()
    : TREASURY_ADDRESSES.get(network)!
}

export const getAddress = (contract: string): Address =>
  Address.fromString(
    (contract == 'LIDO'
      ? LIDO_ADDRESSES.get(network)
      : contract == 'STAKING_ROUTER'
      ? SR_ADDRESSES.get(network)
      : contract == 'NO_REGISTRY'
      ? NOS_ADDRESSES.get(network)
      : contract == 'BURNER'
      ? BURNER_ADDRESSES.get(network)
      : contract == 'INSURANCE_FUND'
      ? getInsuranceFund()
      : contract == 'TREASURY'
      ? TREASURY_ADDRESSES.get(network)
      : contract == 'ACCOUNTING_ORACLE'
      ? ACCOUNTING_ORACLE_ADDRESSES.get(network)
      : null)!
  )

/**
 * Aragon Apps
 **/

export const KERNEL_APP_BASES_NAMESPACE = Bytes.fromHexString(
  '0xf1f3eb40f5bc1ad1344716ced8b8a0431d840b5783aea1fd01786bc26f35ac0f'
)

// Lido App
const LIDO_APP_ID_MAINNET = Bytes.fromHexString(
  '0x3ca7c3e38968823ccb4c78ea688df41356f182ae1d159e4ee608d30d68cef320'
)

const LIDO_APP_ID_HOODI = Bytes.fromHexString(
  '0x3ca7c3e38968823ccb4c78ea688df41356f182ae1d159e4ee608d30d68cef320'
)
const LIDO_APP_IDS = new TypedMap<string, Bytes>()
LIDO_APP_IDS.set('mainnet', LIDO_APP_ID_MAINNET)
LIDO_APP_IDS.set('hoodi', LIDO_APP_ID_HOODI)
export const LIDO_APP_ID = LIDO_APP_IDS.get(network)

// NOR App
const NOR_APP_ID_MAINNET = Bytes.fromHexString(
  '0x7071f283424072341f856ac9e947e7ec0eb68719f757a7e785979b6b8717579d'
)

const NOR_APP_ID_HOODI = Bytes.fromHexString(
  '0x7071f283424072341f856ac9e947e7ec0eb68719f757a7e785979b6b8717579d'
)
const NOR_APP_IDS = new TypedMap<string, Bytes>()
NOR_APP_IDS.set('mainnet', NOR_APP_ID_MAINNET)
NOR_APP_IDS.set('hoodi', NOR_APP_ID_HOODI)
export const NOR_APP_ID = NOR_APP_IDS.get(network)

// Oracle App

const ORACLE_APP_ID_MAINNET = Bytes.fromHexString(
  '0x8b47ba2a8454ec799cd91646e7ec47168e91fd139b23f017455f3e5898aaba93'
)

const ORACLE_APP_ID_HOODI = Bytes.fromHexString(
  '0x8b47ba2a8454ec799cd91646e7ec47168e91fd139b23f017455f3e5898aaba93'
)
const ORACLE_APP_IDS = new TypedMap<string, Bytes>()
ORACLE_APP_IDS.set('mainnet', ORACLE_APP_ID_MAINNET)
ORACLE_APP_IDS.set('hoodi', ORACLE_APP_ID_HOODI)
export const ORACLE_APP_ID = ORACLE_APP_IDS.get(network)

// Voting App

const VOTING_APP_ID_MAINNET = Bytes.fromHexString(
  '0x0abcd104777321a82b010357f20887d61247493d89d2e987ff57bcecbde00e1e'
)

const VOTING_APP_ID_HOODI = Bytes.fromHexString(
  '0x0abcd104777321a82b010357f20887d61247493d89d2e987ff57bcecbde00e1e'
)
const VOTING_APP_IDS = new TypedMap<string, Bytes>()
VOTING_APP_IDS.set('mainnet', VOTING_APP_ID_MAINNET)
VOTING_APP_IDS.set('hoodi', VOTING_APP_ID_HOODI)
export const VOTING_APP_ID = VOTING_APP_IDS.get(network)

// https://docs.lido.fi/deployed-contracts/
export const APP_REPOS = new TypedMap<Bytes, string>()

if (network == 'mainnet') {
  APP_REPOS.set(
    LIDO_APP_ID_MAINNET,
    '0xF5Dc67E54FC96F993CD06073f71ca732C1E654B1'
  )
  APP_REPOS.set(
    NOR_APP_ID_MAINNET,
    '0x0D97E876ad14DB2b183CFeEB8aa1A5C788eB1831'
  )
  APP_REPOS.set(
    ORACLE_APP_ID_MAINNET,
    '0xF9339DE629973c60c4d2b76749c81E6F40960E3A'
  )
  APP_REPOS.set(
    VOTING_APP_ID_MAINNET,
    '0x4Ee3118E3858E8D7164A634825BfE0F73d99C792'
  )
}

if (network == 'hoodi') {
  APP_REPOS.set(LIDO_APP_ID_HOODI, '0xd3545AC0286A94970BacC41D3AF676b89606204F')
  APP_REPOS.set(NOR_APP_ID_HOODI, '0x52eff83071275341ef0A5A2cE48ee818Cef44c39')
  APP_REPOS.set(
    ORACLE_APP_ID_HOODI,
    '0x6E0997D68C1930a76413DE7da666D8A531eF1f9b'
  )
  APP_REPOS.set(
    VOTING_APP_ID_HOODI,
    '0xc972Cdea5956482Ef35BF5852601dD458353cEbD'
  )
}

/**
 * upgrades definition
 **/

// Upgrade Id's (upgrade iterations index with breaking changes )
// initial deploy
// https://etherscan.io/tx/0x3feabd79e8549ad68d1827c074fa7123815c80206498946293d5373a160fd866
// 11473216

export const PROTOCOL_UPG_IDX_V1 = 0

// added TransferShares event
// https://etherscan.io/tx/0x11a48020ae69cf08bd063f1fbc8ecf65bd057015aaa991bf507dbc598aadb68e
// 14860268

export const PROTOCOL_UPG_IDX_V1_SHARES = 1

// Lido v2 deploy
// https://etherscan.io/tx/0x592d68a259af899fb435da0ac08c2fd500cb423f37f1d8ce8e3120cb84186b21
// 17266004
export const PROTOCOL_UPG_IDX_V2 = 2

// Added CSM (Updated AccountingOracle)
// https://etherscan.io/tx/0x0078b3e0cecb3b50c78a22e0b1a985e6cde3bf431e9cb3b2ba4e50260122d542
// 21043699
export const PROTOCOL_UPG_IDX_V2_ADDED_CSM = 3

// list of app's upgrade ids and corresponding min compatible contract version

// block umbers corresponding protocol upgrades
// used for fast detection to avoid fetching app version on every event handle
export const PROTOCOL_UPG_BLOCKS = new TypedMap<string, BigInt[]>()
PROTOCOL_UPG_BLOCKS.set('mainnet', [
  BigInt.fromI32(11473216), // V1
  BigInt.fromI32(14860268), // V1_SHARES
  BigInt.fromI32(17266004), // V2
  BigInt.fromI32(21043699), // V2 CSM Update
])

PROTOCOL_UPG_BLOCKS.set('hoodi', [
  BigInt.fromI32(405), // V1
  BigInt.fromI32(405), // V1_SHARES
  BigInt.fromI32(405), // V2
])

export const PROTOCOL_UPG_APP_VERS = new TypedMap<Bytes, i32[]>()
PROTOCOL_UPG_APP_VERS.set(LIDO_APP_ID_MAINNET, [
  1, // V1, v1.0.0
  3, // V1_SHARES, v3.0.0,
  4, // V2, expected v4.0.0
])
PROTOCOL_UPG_APP_VERS.set(LIDO_APP_ID_HOODI, [])

PROTOCOL_UPG_APP_VERS.set(NOR_APP_ID_MAINNET, [
  1, // V1, v1.0.0
  3, // V1_SHARES, v3.0.0
  4, // V2, expected v4.0.0
])

PROTOCOL_UPG_APP_VERS.set(NOR_APP_ID_HOODI, [])
PROTOCOL_UPG_APP_VERS.set(ORACLE_APP_ID_MAINNET, [
  1, // V1, v1.0.0
  3, // V1_SHARES, v3.0.0
  4, // V2, expected v4.0.0
])
PROTOCOL_UPG_APP_VERS.set(ORACLE_APP_ID_HOODI, [])

PROTOCOL_UPG_APP_VERS.set(VOTING_APP_ID_MAINNET, [])
PROTOCOL_UPG_APP_VERS.set(VOTING_APP_ID_HOODI, [])
