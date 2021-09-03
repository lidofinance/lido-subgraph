import { request, gql } from 'graphql-request'
import { GRAPH, GRAPH_MONITORING } from '../config.js'

export const subgraphFetch = async (query, monitoring = false) =>
  await request(monitoring ? GRAPH_MONITORING : GRAPH, query)

export { gql }
