import { gql } from 'graphql-request'
import { subgraphFetch } from './index.js'

const genQuery = (entityName) => gql`
  {
    ${entityName}(first: 100000, orderBy: block, orderDirection: desc) {
      id
    }
  }
`

export const getEntityCount = async (entityName) =>
  (await subgraphFetch(genQuery(entityName)))[entityName].length
