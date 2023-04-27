import { gql } from 'graphql-request'
import { lidoFuncCall, subgraphFetch } from './utils/index.js'

const query = gql`
  query ($block: Block_height) {
    totals(block: $block) {
      totalShares
    }
  }
`

test('totalShares', async () => {
  const realTotalShares = (await lidoFuncCall('getTotalShares')).toString()
  let q = (await subgraphFetch(query))
  const subgraphTotalShares = (await subgraphFetch(query)).totals[0].totalShares

  expect(subgraphTotalShares).toEqual(realTotalShares)
})
