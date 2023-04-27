import { gql } from 'graphql-request'
import { subgraphFetch } from './index.js'

export const loadAddressShares = async (address) => {
  const query = gql`
    query ($block: Block_height) {
      share(id: "${address}", block: $block) {
        shares
      }
    }
  `

  return (await subgraphFetch(query)).share.shares
}
