import { gql } from 'graphql-request'
import { lidoFuncCall, subgraphFetch } from './utils/index.js'

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
