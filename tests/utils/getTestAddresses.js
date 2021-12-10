import { subgraphFetch, gql, getSubgraphNetwork } from '.'

const transfersQuery = gql`
  query {
    lidoTransfers(first: 100000) {
      from
      to
    }
  }
`

export const getTestAddresses = async (amount = 100, skipImportant = false) => {
  const transfers = (await subgraphFetch(transfersQuery)).lidoTransfers

  const uniqueAddresses = transfers.reduce((acc, item) => {
    acc.add(item.from)
    acc.add(item.to)
    return acc
  }, new Set())

  // Mint address
  uniqueAddresses.delete('0x0000000000000000000000000000000000000000')

  const shuffled = [...uniqueAddresses].sort(() => 0.5 - Math.random())

  if (!skipImportant && (await getSubgraphNetwork()) === 'mainnet') {
    // Make sure some important addresses get into our list:
    // Lido Treasury (Aragon Agent)
    shuffled.unshift('0x3e40d73eb977dc6a537af587d48316fee66e9c8c')
    // Lido Node Operator #0
    shuffled.unshift('0xdd4bc51496dc93a0c47008e820e0d80745476f22')
    // Lido Node Operator #1
    shuffled.unshift('0x8d689476eb446a1fb0065bffac32398ed7f89165')
    // Lido Node Operator #2
    shuffled.unshift('0x9a66fd7948a6834176fbb1c4127c61cb6d349561')
    // Curve stETH pool
    shuffled.unshift('0xdc24316b9ae028f1497c275eb9192a3ea0f67022')
    // 1inch LDO-stETH pool
    shuffled.unshift('0x1f629794b34ffb3b29ff206be5478a52678b47ae')
  }

  const sliced = shuffled.slice(0, amount)

  return sliced
}
