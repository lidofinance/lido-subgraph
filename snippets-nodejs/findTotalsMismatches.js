import { subgraphFetch, gql, lidoFuncCall, Big } from './utils.js'

const firstSubmitQuery = gql`
  query {
    lidoSubmissions(orderBy: block, orderDirection: asc, limit: 1) {
      block
    }
  }
`

const lastIndexedQuery = gql`
  query {
    _meta {
      block {
        number
      }
    }
  }
`

const startBlock = parseInt(
  (await subgraphFetch(firstSubmitQuery)).lidoSubmissions[0].block
)
const endBlock = parseInt(
  (await subgraphFetch(lastIndexedQuery))._meta.block.number
)
const steps = [100000, 1000, 10, 1]

const genQuery = (block) => gql`
  query {
    totals(id: "", block: { number: ${block} }) {
      totalPooledEther
      totalShares
    }
  }
`

let currentMin = startBlock
let currentMax = endBlock

for (const step of steps) {
  for (let block = currentMin; block <= currentMax; block = block + step) {
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

    if (!ethEther.eq(subEther) || !ethShares.eq(subShares)) {
      if (step !== 1) {
        currentMin = block - step
        currentMax = block
        break
      }

      if (!ethEther.eq(subEther)) {
        console.log(
          'Ether mismatch @',
          block,
          ethEther.toString(),
          '<->',
          subEther.toString()
        )
      }
      if (!ethShares.eq(subShares)) {
        console.log(
          'Shares mismatch @',
          block,
          ethShares.toString(),
          '<->',
          subShares.toString()
        )
      }
      process.exit()
    }
    if (block > currentMax - step) {
      console.log('No mismatches found!')
      process.exit()
    }
  }
}
