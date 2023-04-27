import { gql } from 'graphql-request'
import { lidoFuncCall, subgraphFetch } from './utils/index.js'

const query = gql`
  query ($block: Block_height) {
    total(id: "", block: $block) {
      totalShares
    }
  }
`

test('totalShares', async () => {
  const realTotalShares = (await lidoFuncCall('getTotalShares')).toString()
  let q = (await subgraphFetch(query))
  const subgraphTotalShares = (await subgraphFetch(query)).total.totalShares

  expect(subgraphTotalShares).toEqual(realTotalShares)
})
