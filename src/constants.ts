import { BigInt, Address, TypedMap } from '@graphprotocol/graph-ts'

export const CALCULATION_UNIT = BigInt.fromI32(10000)

const LIDO_ADDRESSES = new TypedMap<string, string>()
LIDO_ADDRESSES.set('mainnet', '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84')
LIDO_ADDRESSES.set('goerli', '0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7F')

const NOS_ADDRESSES = new TypedMap<string, string>()
NOS_ADDRESSES.set('mainnet', '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5')
NOS_ADDRESSES.set('goerli', '0x9D4AF1Ee19Dad8857db3a45B0374c81c8A1C6320')

export const getAddress = (contract: string, network: string): Address =>
  Address.fromString(
    (contract == 'Lido'
      ? LIDO_ADDRESSES.get(network)
      : NOS_ADDRESSES.get(network))!
  )
