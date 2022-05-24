import { subgraphFetch, gql, lidoFuncCall, Big } from './utils.js'

const TREASURY_ADDRESS = '0x3e40d73eb977dc6a537af587d48316fee66e9c8c'
const START_BLOCK = 12345
const END_BLOCK = 12345
const STEP = 1

const genQuery = (block) => gql`
  query {
    shares(id: "${TREASURY_ADDRESS}", block: { number: ${block} }) {
      shares
    }
  }
`

for (let block = START_BLOCK; block <= END_BLOCK; block = block + STEP) {
  const rpcValue = Big(
    await lidoFuncCall('sharesOf', TREASURY_ADDRESS, {
      blockTag: block,
    })
  )

  const query = genQuery(block)
  const subgraphData = await subgraphFetch(query)
  const subgraphValue = Big(subgraphData.shares.shares)

  let error = false

  if (!rpcValue.eq(subgraphValue)) {
    console.log(
      'mismatch @',
      block,
      rpcValue.toString(),
      '<->',
      subgraphValue.toString()
    )
    error = true
  }

  if (error) process.exit()
}
