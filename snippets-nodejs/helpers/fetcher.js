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

  if (req.status !== 200) {
    throw new Error()
  }

  const res = await req.json()

  return res.data
}

module.exports = fetcher
