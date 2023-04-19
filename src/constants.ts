import { BigInt, Address, TypedMap, Bytes, dataSource } from '@graphprotocol/graph-ts'
import { Setting } from '../generated/schema'

const network = dataSource.network()

/**
Units
**/

export const ZERO = BigInt.fromI32(0)
export const ONE = BigInt.fromI32(1)

export const CALCULATION_UNIT = BigInt.fromI32(10000)
export const E27_PRECISION_BASE = BigInt.fromString('1000000000000000000000000000').toBigDecimal()
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

export const ZERO_ADDRESS = Address.fromString('0x0000000000000000000000000000000000000000')

const LIDO_ADDRESSES = new TypedMap<string, string>()
LIDO_ADDRESSES.set('mainnet', '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84')
LIDO_ADDRESSES.set('goerli', '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F')

const NOS_ADDRESSES = new TypedMap<string, string>()
NOS_ADDRESSES.set('mainnet', '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5')
NOS_ADDRESSES.set('goerli', '0x9D4AF1Ee19Dad8857db3a45B0374c81c8A1C6320')

const TREASURY_ADDRESSES = new TypedMap<string, string>()
TREASURY_ADDRESSES.set('mainnet', '0x3e40D73EB977Dc6a537aF587D48316feE66E9C8c')
TREASURY_ADDRESSES.set('goerli', '0x4333218072D5d7008546737786663c38B4D561A4')

const SR_ADDRESSES = new TypedMap<string, string>()
// todo change
SR_ADDRESSES.set('mainnet', '0xa3Dbd317E53D363176359E10948BA0b1c0A4c820')
SR_ADDRESSES.set('goerli', '0xa3Dbd317E53D363176359E10948BA0b1c0A4c820')

const BURNER_ADDRESSES = new TypedMap<string, string>()
// todo change
BURNER_ADDRESSES.set('mainnet', '0x20c61C07C2E2FAb04BF5b4E12ce45a459a18f3B1')
BURNER_ADDRESSES.set('goerli', '0x20c61C07C2E2FAb04BF5b4E12ce45a459a18f3B1')

// We presume here that initially insurance fund was the treasury
const getInsuranceFund = (): string =>
  Setting.load('') ? Setting.load('')!.insuranceFund.toHex() : TREASURY_ADDRESSES.get(network)!

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
      : contract == 'TREASURE'
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
const LIDO_APP_ID_GOERLI = Bytes.fromHexString('0x79ac01111b462384f1b7fba84a17b9ec1f5d2fddcfcb99487d71b443832556ea')
const LIDO_APP_ID_MAINNET = Bytes.fromHexString('0x3ca7c3e38968823ccb4c78ea688df41356f182ae1d159e4ee608d30d68cef320')
const LIDO_APP_IDS = new TypedMap<string, Bytes>()
LIDO_APP_IDS.set('mainnet', LIDO_APP_ID_MAINNET)
LIDO_APP_IDS.set('goerli', LIDO_APP_ID_GOERLI)
export const LIDO_APP_ID = LIDO_APP_IDS.get(network)

// NOR App
const NOR_APP_ID_GOERLI = Bytes.fromHexString('0x57384c8fcaf2c1c2144974769a6ea4e5cf69090d47f5327f8fc93827f8c0001a')
const NOR_APP_ID_MAINNET = Bytes.fromHexString('0x7071f283424072341f856ac9e947e7ec0eb68719f757a7e785979b6b8717579d')
const NOR_APP_IDS = new TypedMap<string, Bytes>()
NOR_APP_IDS.set('mainnet', NOR_APP_ID_MAINNET)
NOR_APP_IDS.set('goerli', NOR_APP_ID_GOERLI)
export const NOR_APP_ID = NOR_APP_IDS.get(network)

// Oracle App
const ORACLE_APP_ID_GOERLI = Bytes.fromHexString('0xb2977cfc13b000b6807b9ae3cf4d938f4cc8ba98e1d68ad911c58924d6aa4f11')
const ORACLE_APP_ID_MAINNET = Bytes.fromHexString('0x8b47ba2a8454ec799cd91646e7ec47168e91fd139b23f017455f3e5898aaba93')
const ORACLE_APP_IDS = new TypedMap<string, Bytes>()
ORACLE_APP_IDS.set('mainnet', ORACLE_APP_ID_MAINNET)
ORACLE_APP_IDS.set('goerli', ORACLE_APP_ID_GOERLI)
export const ORACLE_APP_ID = ORACLE_APP_IDS.get(network)

// Voting App
const VOTING_APP_ID_GOERLI = Bytes.fromHexString('0xee7f2abf043afe722001aaa900627a6e29adcbcce63a561fbd97e0a0c6429b94')
const VOTING_APP_ID_MAINNET = Bytes.fromHexString('0x0abcd104777321a82b010357f20887d61247493d89d2e987ff57bcecbde00e1e')
const VOTING_APP_IDS = new TypedMap<string, Bytes>()
VOTING_APP_IDS.set('mainnet', VOTING_APP_ID_MAINNET)
VOTING_APP_IDS.set('goerli', VOTING_APP_ID_GOERLI)
export const VOTING_APP_ID = VOTING_APP_IDS.get(network)

export const APP_REPOS = new TypedMap<Bytes, string>()
APP_REPOS.set(LIDO_APP_ID_MAINNET, '0xF5Dc67E54FC96F993CD06073f71ca732C1E654B1')
APP_REPOS.set(LIDO_APP_ID_GOERLI, '0xE9eDe497d2417fd980D8B5338232666641B9B9aC')
APP_REPOS.set(NOR_APP_ID_MAINNET, '0x0D97E876ad14DB2b183CFeEB8aa1A5C788eB1831')
APP_REPOS.set(NOR_APP_ID_GOERLI, '0x5F867429616b380f1Ca7a7283Ff18C53a0033073')
APP_REPOS.set(ORACLE_APP_ID_MAINNET, '0xF9339DE629973c60c4d2b76749c81E6F40960E3A')
APP_REPOS.set(ORACLE_APP_ID_GOERLI, '0x9234e37Adeb44022A078557D9943b72AB89bF36a')
APP_REPOS.set(VOTING_APP_ID_MAINNET, '0x4Ee3118E3858E8D7164A634825BfE0F73d99C792')
APP_REPOS.set(VOTING_APP_ID_GOERLI, '0x14de4f901cE0B81F4EfcA594ad7b70935C276806')

/**
 * upgrades definition
 **/

// Upgrade Id's (upgrade iterations index with breaking changes )
// initial deploy
export const UPG_V1_INIT = 0

// added TransferShares event
// https://etherscan.io/tx/0x11a48020ae69cf08bd063f1fbc8ecf65bd057015aaa991bf507dbc598aadb68e
// 14860268
// https://goerli.etherscan.io/tx/0x61fdb6110874916557acdc51b039d0b12570675693375e8dfb4a24929d0bea45
// 6912872
export const UPG_V1_SHARES = 1

// Lido v2 deploy, beta
// https://goerli.etherscan.io/tx/0x75dae29ccd81f0b93c2207935e6c0e484ee6ad5307455015c962c9206ce7e8d6
// 8710746
export const UPG_V2_BETA = 2

// v2 RC deploy
export const UPG_V2_RC = 3

// list of app's upgrade ids and corresponding min compatible contract version
export const APP_UPG_VERS = new TypedMap<Bytes, i32[]>()
APP_UPG_VERS.set(LIDO_APP_ID_MAINNET, [
  1, // V1_INIT, v1.0.0
  3, // V1_SHARES, v3.0.0,
  999, // V2_BETA, TBD
  999 // V2_RC, TBD
])
APP_UPG_VERS.set(LIDO_APP_ID_GOERLI, [
  1, // V1_INIT, v1.0.0
  8, // V1_SHARES, v8.0.0
  10, // V2_BETA, v10.0.0
  999 // V2_RC, TBD
])
APP_UPG_VERS.set(NOR_APP_ID_MAINNET, [
  1, // V1_INIT, v1.0.0
  3, // V1_SHARES, v3.0.0
  999, // V2_BETA, TBD
  999 // V2_RC, TBD
])
APP_UPG_VERS.set(NOR_APP_ID_GOERLI, [
  1, // V1_INIT, v1.0.0
  6, // V1_SHARES, v6.0.0,
  8, // V2_BETA, 8.0.0
  999 // V2_RC, TBD
])
APP_UPG_VERS.set(ORACLE_APP_ID_MAINNET, [
  1, // V1_INIT, v1.0.0
  3, // V1_SHARES, v3.0.0
  999, // V2_BETA, TBD
  999 // V2_RC, TBD
])
APP_UPG_VERS.set(ORACLE_APP_ID_GOERLI, [
  1, // V1_INIT, v1.0.0
  4, // V1_SHARES, v4.0.0
  5, // V2_BETA, v5.0.0
  999 // V2_RC, TBD
])
APP_UPG_VERS.set(VOTING_APP_ID_MAINNET, [])
APP_UPG_VERS.set(VOTING_APP_ID_GOERLI, [])

export const isAppVerMatchUpgId = (appId: Bytes, curVer: i32, minUpgId: i32): bool => {
  const upgVers = APP_UPG_VERS.get(appId)
  // if no upgrades defined assuming subgraph code fully compatible with deployed contracts
  if (!upgVers || upgVers.length == 0) return true

  // check requested minUpgId is defined and it's contract version is below requested curVer
  return minUpgId < upgVers.length && upgVers[minUpgId] <= curVer
}
