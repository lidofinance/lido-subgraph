import { lidoFuncCall, subgraphFetch, gql } from './utils'

const query = gql`
  {
    totals(id: "") {
      totalPooledEther
    }
  }
`

test('totalPooledEther', async () => {
  const realTotalShares = (await lidoFuncCall('getTotalPooledEther')).toString()
  const subgraphTotalShares = (await subgraphFetch(query)).totals
    .totalPooledEther

  expect(subgraphTotalShares).toEqual(realTotalShares)
})
