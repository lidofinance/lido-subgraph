const fetch = require('node-fetch')

const GRAPH = '127.0.0.1'

const fetcher = async (query) => {
  const req = await fetch(
    'http://' + GRAPH + ':8000/subgraphs/name/lido-subgraph',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  )
  const res = await req.json()
  return res.data
}

module.exports = fetcher
