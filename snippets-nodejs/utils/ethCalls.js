import { providers, Contract } from 'ethers'
import { RPC } from '../config.js'
import lidoAbi from '../../abis/Lido.json'

const provider = new providers.JsonRpcProvider(RPC)

export const ethCall = async (func, ...args) => await provider[func](...args)

export const lidoFuncCall = async (func, ...args) => {
  const lidoContract = new Contract(
    getContractAddress('Lido'),
    lidoAbi,
    provider
  )
  return await lidoContract[func](...args)
}

export const getAddressShares = async (address, ...args) =>
  await lidoFuncCall('sharesOf', address, ...args)

export const getAddressBalance = async (address, ...args) =>
  await lidoFuncCall('balanceOf', address, ...args)

export const getBalanceFromShares = async (address, ...args) =>
  await lidoFuncCall('getPooledEthByShares', address, ...args)
