import { subgraphFetch, gql } from '.'

const totalRewardsQuery = gql`
  {
    totalRewards(first: 100000, orderBy: block, orderDirection: desc) {
      id
    }
  }
`

export const getAllOraclesReports = async () =>
  (await subgraphFetch(totalRewardsQuery)).totalRewards
