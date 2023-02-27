import fs from 'fs'
import ethers from 'ethers'
import { jest } from '@jest/globals'

const BILLING_CONTRACT_ADDRESS = '0x1B07D3344188908Fb6DEcEac381f3eE63C48477a'
const LIDO_ADDRESS = process.env.THEGRAPH_BILLING_ADDRESS
const THRESHOLD_ETH = ethers.constants.WeiPerEther.mul(1 * 1000) // 1k GRT

jest.setTimeout(10000)

jest.retryTimes(3)

test('The Graph balance check', async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    'https://arb1.arbitrum.io/rpc'
  )
  const abi = JSON.parse(fs.readFileSync('abis/Billing.json'))
  const contract = new ethers.Contract(BILLING_CONTRACT_ADDRESS, abi, provider)
  const balanceWei = await contract.userBalances(LIDO_ADDRESS)
  const balanceEth = balanceWei.div(ethers.constants.WeiPerEther)

  expect(balanceEth.gte(THRESHOLD_ETH)).toBe(true)
})
