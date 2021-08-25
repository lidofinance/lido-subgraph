import { ethers } from 'ethers'
import fs from 'fs'

import { RPC, LIDO_ADDRESS } from '../config'

const provider = new ethers.providers.JsonRpcProvider(RPC)

const lidoAbi = JSON.parse(fs.readFileSync('abis/Lido.json'))
const lidoContract = new ethers.Contract(LIDO_ADDRESS, lidoAbi, provider)

export const ethCall = async (func, ...args) => await provider[func](...args)

export const lidoFuncCall = async (func, ...args) =>
  await lidoContract[func](...args)

export const getAddressShares = async (address) =>
  await lidoFuncCall('sharesOf', address)
