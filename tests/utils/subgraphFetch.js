import { request } from 'graphql-request'
import { GRAPH, GRAPH_MONITORING, RPC_SYNC_BLOCK } from '../config.js'

const adjustQuery = (query) => {
  if (!RPC_SYNC_BLOCK) {
    return query
  }

  return query.replace(')', `, block: { number: ${process.env.BLOCK} })`)
}

export const subgraphFetch = async (query, monitoring = false) =>
  !monitoring
    ? await request(GRAPH, adjustQuery(query))
    : await request(GRAPH_MONITORING, query)
