import { subgraphFetch, gql } from '.'

const transfersQuery = gql`
  {
    indexingStatusForCurrentVersion(subgraphName: "lido") {
      chains {
        latestBlock {
          hash
          number
        }
      }
    }
  }
`

export const getLastIndexedBlock = async () =>
  parseInt(
    (await subgraphFetch(transfersQuery, true)).indexingStatusForCurrentVersion
      .chains[0].latestBlock.number
  )
