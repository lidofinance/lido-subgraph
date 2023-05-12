import { providers, Contract } from 'ethers'
import { RPC, getBlock, getContractAddress } from '../config.js'
import lidoAbi from '../../abis/Lido.json'
import oracleAbi from '../../abis/LegacyOracle.json'
import norAbi from '../../abis/NodeOperatorsRegistry.json'
import votingAbi from '../../abis/Voting.json'
import easyTrackAbi from '../../abis/EasyTrack.json'

const provider = new providers.JsonRpcProvider(RPC)
export const getContract = (name, abi) =>
  new Contract(getContractAddress(name), abi, provider)

export const getLidoContract = () => getContract('Lido', lidoAbi)
export const getNORContract = () => getContract('NodeOperatorsRegistry', norAbi)
export const getLegacyOracleContract = () =>
  getContract('LegacyOracle', oracleAbi)
export const getVotingContract = () => getContract('Voting', votingAbi)
export const getEasyTrackContract = () => getContract('EasyTrack', easyTrackAbi)

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
  await getLidoContract()[func](...(await mbAddBlock(initialArgs)))

export const oracleFuncCall = async (func, ...initialArgs) =>
  await getLegacyOracleContract()[func](...(await mbAddBlock(initialArgs)))

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
  return await getEvents(getLidoContract(), eventName, startBlock, endBlock)
}

export const getLegacyOracleEvents = async (
  eventName,
  startBlock,
  endBlock
) => {
  return await getEvents(
    getLegacyOracleContract(),
    eventName,
    startBlock,
    endBlock
  )
}

export const getNOREvents = async (eventName, startBlock, endBlock) => {
  return await getEvents(getNORContract(), eventName, startBlock, endBlock)
}

export const getVotingEvents = async (eventName, startBlock, endBlock) => {
  return await getEvents(getVotingContract(), eventName, startBlock, endBlock)
}

export const getEasyTrackEvents = async (eventName, startBlock, endBlock) => {
  return await getEvents(
    getEasyTrackContract(),
    eventName,
    startBlock,
    endBlock
  )
}

export const getRpcNetwork = async () => (await provider.getNetwork()).name

export const getLastRpcBlock = async () =>
  parseInt((await provider.getBlock('latest')).number)
