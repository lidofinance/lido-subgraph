import { providers, Contract, constants } from 'ethers'
import { jest } from '@jest/globals'
import billingAbi from '../abis/Billing.json'

const BILLING_CONTRACT_ADDRESS = '0x1B07D3344188908Fb6DEcEac381f3eE63C48477a'
const SUBGRAPH_MULTISIG_ADDRESS = '0x421eB124FCbF69CE9B26C13719D7c288e6D6A94c'
const THRESHOLD_ETH = constants.WeiPerEther.mul(3 * 1000) // 3k GRT

jest.setTimeout(10000)
jest.retryTimes(3)

test('The Graph balance check', async () => {
  const provider = new providers.JsonRpcProvider('https://arb1.arbitrum.io/rpc')
  const contract = new Contract(BILLING_CONTRACT_ADDRESS, billingAbi, provider)
  const balance = await contract.userBalances(SUBGRAPH_MULTISIG_ADDRESS)

  expect(balance.gte(THRESHOLD_ETH)).toBe(true)
})
