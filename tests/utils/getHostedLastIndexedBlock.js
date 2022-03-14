import { gql } from 'graphql-request'
import { subgraphFetch } from './index.js'

const transfersQuery = gql`
  {
    lidoTransfers(first: 1, orderBy: block, orderDirection: desc) {
      block
    }
  }
`

export const getHostedLastIndexedBlock = async () =>
  parseInt((await subgraphFetch(transfersQuery)).lidoTransfers[0].block)
