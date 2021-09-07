import { subgraphFetch, gql } from '.'

// We can fetch only 1000 entities in one request
const transfersQuery = gql`
  query {
    lidoTransfers(first: 100000) {
      from
      to
    }
  }
`

export const getTestAddresses = async (amount = 100) => {
  const transfers = (await subgraphFetch(transfersQuery)).lidoTransfers

  const uniqueAddresses = transfers.reduce((acc, item) => {
    acc.add(item.from)
    acc.add(item.to)
    return acc
  }, new Set())

  // Mint address
  uniqueAddresses.delete('0x0000000000000000000000000000000000000000')
  // Lido Aragon agent
  uniqueAddresses.delete('0x3e40d73eb977dc6a537af587d48316fee66e9c8c')

  const shuffled = [...uniqueAddresses].sort(() => 0.5 - Math.random())

  return shuffled.slice(0, amount)
}
