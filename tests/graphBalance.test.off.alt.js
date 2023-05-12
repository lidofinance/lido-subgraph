import { providers, Contract, constants } from 'ethers'
import { jest } from '@jest/globals'
import { getContractAddress } from './config.js'
import bollingAbi from '../abis/Billing.json'

const BILLING_CONTRACT_ADDRESS = '0x1B07D3344188908Fb6DEcEac381f3eE63C48477a'
const THRESHOLD_ETH = constants.WeiPerEther.mul(1 * 1000) // 1k GRT

jest.setTimeout(10000)
jest.retryTimes(3)

test('The Graph balance check', async () => {
  const provider = new providers.JsonRpcProvider('https://arb1.arbitrum.io/rpc')
  const contract = new Contract(BILLING_CONTRACT_ADDRESS, bollingAbi, provider)
  const balance = await contract.userBalances(getContractAddress('Lido'))

  expect(balance.gte(THRESHOLD_ETH)).toBe(true)
})
