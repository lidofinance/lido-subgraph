import { subgraphFetch, gql } from './utils'

const query = gql`
  query {
    totalRewards(first: 1000, where: { dust: 0 }) {
      dust
    }
  }
`

test('there is no mismatched dust transactions', async () => {
  const totalRewards = (await subgraphFetch(query)).totalRewards

  expect(totalRewards).toEqual([])
})
