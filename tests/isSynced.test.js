import { ethCall, subgraphFetch, gql } from './utils'

const query = gql`
  query {
    lidoTransfers(first: 1, orderBy: block, orderDirection: desc) {
      block
    }
  }
`

test('isSynced', async () => {
  const currentBlock = (await ethCall('getBlock', 'latest')).number
  const adequateBuffer = currentBlock - 300
  const subgraphTotalShares = parseInt(
    (await subgraphFetch(query)).lidoTransfers[0].block
  )

  expect(subgraphTotalShares).toBeGreaterThanOrEqual(adequateBuffer)
})
