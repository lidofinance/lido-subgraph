import { ethers } from 'ethers'
import fs from 'fs'

import { RPC, LIDO_ADDRESS, RPC_SYNC_BLOCK } from '../config.js'

const provider = new ethers.providers.JsonRpcProvider(RPC)

const lidoAbi = JSON.parse(fs.readFileSync('abis/Lido.json'))
const lidoContract = new ethers.Contract(LIDO_ADDRESS, lidoAbi, provider)

const oracleAddress = await lidoContract.getOracle()
const oracleAbi = JSON.parse(fs.readFileSync('abis/LidoOracle.json'))
const oracleContract = new ethers.Contract(oracleAddress, oracleAbi, provider)

const genCallBlock = async (args) => {
  const blockIsOverriden = args.find((x) => x.blockTag)

  if (blockIsOverriden) {
    return args
  }

  if (RPC_SYNC_BLOCK) {
    args.push({ blockTag: parseInt(process.env.BLOCK) })
  }

  return args
}

export const ethCall = async (func, ...initialArgs) =>
  await provider[func](...(await genCallBlock(initialArgs)))

export const lidoFuncCall = async (func, ...initialArgs) =>
  await lidoContract[func](...(await genCallBlock(initialArgs)))

export const oracleFuncCall = async (func, ...initialArgs) =>
  await oracleContract[func](...(await genCallBlock(initialArgs)))

export const getAddressShares = async (address, ...args) =>
  await lidoFuncCall('sharesOf', address, ...args)

export const getAddressBalance = async (address, ...args) =>
  await lidoFuncCall('balanceOf', address, ...args)

export const getBalanceFromShares = async (address, ...args) =>
  await lidoFuncCall('getPooledEthByShares', address, ...args)

const genEventBlock = async () =>
  RPC_SYNC_BLOCK ? parseInt(process.env.BLOCK) : 'latest'

export const getLidoEventNumber = async (eventName) => {
  const filter = lidoContract.filters[eventName]()
  const logs = lidoContract.queryFilter(filter, 0, await genEventBlock())

  return (await logs).length
}

export const getOracleEventNumber = async (eventName) => {
  const filter = oracleContract.filters[eventName]()
  const logs = oracleContract.queryFilter(filter, 0, await genEventBlock())

  return (await logs).length
}
