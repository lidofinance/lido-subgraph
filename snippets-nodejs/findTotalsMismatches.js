import { subgraphFetch, gql, lidoFuncCall, Big } from './utils.js'

const START_BLOCK = 123
const END_BLOCK = 123

const STEP = 1

const genQuery = (block) => gql`
  query {
    totals(id: "", block: { number: ${block} }) {
      totalPooledEther
      totalShares
    }
  }
`

for (let block = START_BLOCK; block <= END_BLOCK; block = block + STEP) {
  const ethEther = Big(
    await lidoFuncCall('getTotalPooledEther', {
      blockTag: block,
    })
  )
  const ethShares = Big(
    await lidoFuncCall('getTotalShares', {
      blockTag: block,
    })
  )

  const query = genQuery(block)
  const subgraphData = await subgraphFetch(query)
  const subEther = Big(subgraphData.totals.totalPooledEther)
  const subShares = Big(subgraphData.totals.totalShares)

  let error = false

  if (!ethEther.eq(subEther)) {
    console.log(
      'Ether mismatch @',
      block,
      ethEther.toString(),
      '<->',
      subEther.toString()
    )
    error = true
  }
  if (!ethShares.eq(subShares)) {
    console.log(
      'Shares mismatch @',
      block,
      ethShares.toString(),
      '<->',
      subShares.toString()
    )
    error = true
  }

  if (error) process.exit()
}
