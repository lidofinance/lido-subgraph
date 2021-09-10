import { subgraphFetch, gql } from '.'

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
