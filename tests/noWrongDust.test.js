import { subgraphFetch, gql } from './utils'

// If we chose a wrong dust boundary, dust can be mistaken as treasury fee
const query = gql`
  query {
    totalRewards(first: 1000, where: { dust: 0, treasuryFee_not: null }) {
      dust
    }
  }
`

test('there is no mismatched dust transactions', async () => {
  const totalRewards = (await subgraphFetch(query)).totalRewards

  expect(totalRewards).toEqual([])
})
