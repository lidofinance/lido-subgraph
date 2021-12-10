import { subgraphFetch, gql } from '.'

const indexingStatusQuery = gql`
  {
    indexingStatusForCurrentVersion(subgraphName: "${process.env.SUBGRAPH_NAME}") {
      chains {
        network
      }
    }
  }
`

export const getSubgraphNetwork = async () =>
  parseInt(
    (await subgraphFetch(indexingStatusQuery, true))
      .indexingStatusForCurrentVersion.chains[0].network
  )
