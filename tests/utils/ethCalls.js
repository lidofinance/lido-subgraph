import { providers, Contract } from 'ethers'
import fs from 'fs'

import {
  ARAGON_ADDRESS,
  EASYTRACK_ADDRESS,
  LIDO_ADDRESS,
  NOP_ADDRESS,
  RPC,
  getBlock,
} from '../config.js'

const provider = new providers.JsonRpcProvider(RPC)

const lidoAbi = JSON.parse(fs.readFileSync('abis/Lido.json'))
const lidoContract = new Contract(LIDO_ADDRESS, lidoAbi, provider)

const oracleAddress = await lidoContract.getOracle()
const oracleAbi = JSON.parse(fs.readFileSync('abis/LegacyOracle.json'))
const oracleContract = new Contract(oracleAddress, oracleAbi, provider)

const nopRegistryAbi = JSON.parse(
  fs.readFileSync('abis/NodeOperatorsRegistry.json')
)
const nopRegistryContract = new Contract(NOP_ADDRESS, nopRegistryAbi, provider)

const aragonAbi = JSON.parse(fs.readFileSync('abis/Voting.json'))
const aragonContract = new Contract(ARAGON_ADDRESS, aragonAbi, provider)

const easyTrackAbi = JSON.parse(fs.readFileSync('abis/EasyTrack.json'))
const easyTrackContract = new Contract(
  EASYTRACK_ADDRESS,
  easyTrackAbi,
  provider
)

const mbAddBlock = async (args) => {
  const blockIsOverriden = args.find((x) => x.blockTag)

  if (blockIsOverriden) {
    return args
  }

  const block = getBlock()

  args.push({ blockTag: block })

  return args
}

export const ethCall = async (func, ...initialArgs) =>
  await provider[func](...(await mbAddBlock(initialArgs)))

export const lidoFuncCall = async (func, ...initialArgs) =>
  await lidoContract[func](...(await mbAddBlock(initialArgs)))

export const oracleFuncCall = async (func, ...initialArgs) =>
  await oracleContract[func](...(await mbAddBlock(initialArgs)))

export const getAddressShares = async (address, ...args) =>
  await lidoFuncCall('sharesOf', address, ...args)

export const getAddressBalance = async (address, ...args) =>
  await lidoFuncCall('balanceOf', address, ...args)

export const getBalanceFromShares = async (address, ...args) =>
  await lidoFuncCall('getPooledEthByShares', address, ...args)

export const getEvents = async (contract, eventName, startBlock, endBlock) => {
  const filter = contract.filters[eventName]()
  return await contract.queryFilter(
    filter,
    startBlock ?? 0,
    endBlock ?? getBlock()
  )
}

export const getLidoEvents = async (eventName, startBlock, endBlock) => {
  return await getEvents(lidoContract, eventName, startBlock, endBlock)
}

export const getLidoOracleEvents = async (eventName, startBlock, endBlock) => {
  return await getEvents(oracleContract, eventName, startBlock, endBlock)
}

export const getNopRegistryEvents = async (eventName, startBlock, endBlock) => {
  return await getEvents(nopRegistryContract, eventName, startBlock, endBlock)
}

export const getAragonEvents = async (eventName, startBlock, endBlock) => {
  return await getEvents(aragonContract, eventName, startBlock, endBlock)
}

export const getEasyTrackEvents = async (eventName, startBlock, endBlock) => {
  return await getEvents(easyTrackContract, eventName, startBlock, endBlock)
}

export const getRpcNetwork = async () => await provider.getNetwork()
