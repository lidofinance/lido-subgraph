import { request } from 'graphql-request'
import { GRAPH, getBlock } from '../config.js'

const FETCH_STEP = 1000
const SKIP_STEP = 1000

// Add fixed block if not set already
const mbAddFixedBlock = (vars) => {
  if (vars.block) {
    return query
  }

  const block = getBlock()
  return { ...vars, block: { number: block } }
}

// Warning: Assumes one-key objects
const mergeObjects = (array) =>
  array.reduce((acc, cur) => {
    const key = Object.keys(cur)[0]
    const exists = key === Object.keys(acc)[0]

    acc[key] = exists ? [...acc[key], ...cur[key]] : cur[key]

    return acc
  }, {})

export const subgraphFetch = async (query, vars = {}) => {
  let skip = 0
  let results = null

  do {
    const res = await request(GRAPH, query, {
      first: FETCH_STEP,
      skip: skip,
      ...mbAddFixedBlock(vars),
    })

    results = results ? mergeObjects([results, res]) : res

    // Exit if we don't need to pull all available data
    if (vars?.first || vars?.skip) {
      break
    }

    skip += SKIP_STEP
  } while (
    // Items should exist at all
    results[Object.keys(results)[0]].length &&
    // More items should exist
    results[Object.keys(results)[0]].length % SKIP_STEP === 0
  )

  return results
}
