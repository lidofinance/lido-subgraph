import { subgraphFetch, gql } from '.'

// We can fetch only 1000 entities in one request
const totalsQuery = gql`
  query {
    totals(id: "") {
      totalPooledEther
      totalShares
    }
  }
`

export const getTotals = async () => (await subgraphFetch(totalsQuery)).totals
