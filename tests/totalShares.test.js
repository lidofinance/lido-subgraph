import { gql } from 'graphql-request'
import { lidoFuncCall, subgraphFetch } from './utils/index.js'

const query = gql`
  {
    totals(id: "") {
      totalShares
    }
  }
`

test('totalShares', async () => {
  const realTotalShares = (await lidoFuncCall('getTotalShares')).toString()
  const subgraphTotalShares = (await subgraphFetch(query)).totals.totalShares

  expect(subgraphTotalShares).toEqual(realTotalShares)
})
