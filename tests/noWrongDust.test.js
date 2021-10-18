import { subgraphFetch, gql } from './utils'

// TODO: This runs on hosted as well, respect limit and adjust after migration
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
