import { subgraphFetch, gql } from '.'

const transfersQuery = gql`
  {
    lidoTransfers(first: 1, orderBy: block, orderDirection: desc) {
      block
    }
  }
`

export const getHostedLastIndexedBlock = async () =>
  parseInt((await subgraphFetch(transfersQuery)).lidoTransfers[0].block)
