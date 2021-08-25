import { lidoFuncCall, subgraphFetch, gql } from './utils'

const query = gql`
  {
    totalPooledEther(id: 0) {
      total
    }
  }
`

test('totalPooledEther', async () => {
  const realTotalShares = (await lidoFuncCall('getTotalPooledEther')).toString()
  const subgraphTotalShares = (await subgraphFetch(query)).totalPooledEther
    .total

  expect(subgraphTotalShares).toEqual(realTotalShares)
})
