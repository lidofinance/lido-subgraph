import { gql } from 'graphql-request'
import { subgraphFetch } from './index.js'

export const loadAddressShares = async (address) => {
  const query = gql`
    {
      shares(id: "${address}") {
        shares
      }
    }
  `

  return (await subgraphFetch(query)).shares.shares
}
