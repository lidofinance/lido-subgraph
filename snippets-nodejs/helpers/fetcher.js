const fetch = require('node-fetch')

const GRAPH = 'https://api.thegraph.com/subgraphs/name/lidofinance/lido'

const fetcher = async (query) => {
  const req = await fetch(GRAPH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  const res = await req.json()
  return res.data
}

module.exports = fetcher
