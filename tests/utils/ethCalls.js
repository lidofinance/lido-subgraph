import { ethers } from 'ethers'
import fs from 'fs'

import { getLastIndexedBlock } from '.'
import { RPC, LIDO_ADDRESS, RPC_SYNC_BLOCK } from '../config'

const provider = new ethers.providers.JsonRpcProvider(RPC)

const lidoAbi = JSON.parse(fs.readFileSync('abis/Lido.json'))
const lidoContract = new ethers.Contract(LIDO_ADDRESS, lidoAbi, provider)

const oracleAddress = await lidoContract.getOracle()
const oracleAbi = JSON.parse(fs.readFileSync('abis/LidoOracle.json'))
const oracleContract = new ethers.Contract(oracleAddress, oracleAbi, provider)

const maybeAddBlock = async (args) => {
  const blockIsOverriden = args.find((x) => x.blockTag)

  if (blockIsOverriden) {
    return args
  }

  if (RPC_SYNC_BLOCK) {
    const block = parseInt(await getLastIndexedBlock())
    args.push({ blockTag: block })
  }

  return args
}

export const ethCall = async (func, ...initialArgs) =>
  await provider[func](...(await maybeAddBlock(initialArgs)))

export const lidoFuncCall = async (func, ...initialArgs) =>
  await lidoContract[func](...(await maybeAddBlock(initialArgs)))

export const oracleFuncCall = async (func, ...initialArgs) =>
  await oracleContract[func](...(await maybeAddBlock(initialArgs)))

export const getAddressShares = async (address, ...args) =>
  await lidoFuncCall('sharesOf', address, ...args)

export const getAddressBalance = async (address, ...args) =>
  await lidoFuncCall('balanceOf', address, ...args)

export const getBalanceFromShares = async (address, ...args) =>
  await lidoFuncCall('getPooledEthByShares', address, ...args)

export const getLidoEventNumber = async (eventName) => {
  const filter = lidoContract.filters[eventName]()
  const logs = lidoContract.queryFilter(filter, 0, 'latest')

  return (await logs).length
}

export const getOracleEventNumber = async (eventName) => {
  const filter = oracleContract.filters[eventName]()
  const logs = oracleContract.queryFilter(filter, 0, 'latest')

  return (await logs).length
}
