import { gql } from 'graphql-request'
import { subgraphFetch } from './index.js'

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
