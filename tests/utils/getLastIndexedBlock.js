import { gql } from 'graphql-request'
import { subgraphFetch } from './index.js'

const transfersQuery = gql`
  {
    indexingStatusForCurrentVersion(subgraphName: "${process.env.SUBGRAPH_NAME}") {
      chains {
        latestBlock {
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
