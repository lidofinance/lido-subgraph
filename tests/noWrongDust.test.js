import { gql } from 'graphql-request'
import { subgraphFetch } from './utils/index.js'

// If we chose a wrong dust boundary, dust can be mistaken as treasury fee
const query = gql`
  query ($first: Int, $skip: Int) {
    totalRewards(
      first: $first
      skip: $skip
      where: { dust: 0, treasuryFee_not: null }
    ) {
      dust
    }
  }
`

test('there is no mismatched dust transactions', async () => {
  const totalRewards = (await subgraphFetch(query)).totalRewards

  expect(totalRewards).toEqual([])
})
