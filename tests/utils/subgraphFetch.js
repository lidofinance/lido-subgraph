import { request, gql } from 'graphql-request'
import { GRAPH } from '../config'

export const subgraphFetch = async (query) => await request(GRAPH, query)

export { gql }
