import { gql, request } from 'graphql-request'
import ethers from 'ethers'
import { jest } from '@jest/globals'

const LIDO_ADDRESS = process.env.THEGRAPH_BILLING_ADDRESS
const THRESHOLD_ETH = ethers.constants.WeiPerEther.mul(1 * 1000) // 1k GRT
const BILLING_SUBGRAPH =
  'https://api.thegraph.com/subgraphs/name/graphprotocol/graph-network-mainnet'

jest.setTimeout(10000)

jest.retryTimes(3)

const balanceQuery = gql`
  query basicAccount($id: ID!, $block: Block_height) {
    graphAccount(id: $id, block: $block) {
      id
      balance
    }
  }
`

test('The Graph balance check', async () => {
  const res = await request(BILLING_SUBGRAPH, balanceQuery, {
    // Don't use checksummed addresses here as they are not checksummed in Subgraphs
    id: LIDO_ADDRESS.toLowerCase(),
  })

  const rawBalance = ethers.BigNumber.from(res.graphAccount.balance)
  const balance = rawBalance.div(ethers.constants.WeiPerEther)

  expect(balance.gte(THRESHOLD_ETH)).toBe(true)
})
