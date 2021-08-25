import { lidoFuncCall, subgraphFetch, gql } from './utils'

const query = gql`
  {
    totalShares(id: 0) {
      total
    }
  }
`

test('totalShares', async () => {
  const realTotalShares = (await lidoFuncCall('getTotalShares')).toString()
  const subgraphTotalShares = (await subgraphFetch(query)).totalShares.total

  expect(subgraphTotalShares).toEqual(realTotalShares)
})
