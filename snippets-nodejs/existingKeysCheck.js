const fetch = require('node-fetch')

const pubKey = 'KEYHERE'

const query = `query {
	  nodeOperatorSigningKeys(where: {pubkey: "${pubKey}"}) {
		id
		operatorId
		pubkey
	  }
	}`

fetch('http://localhost:8000/subgraphs/name/lido-subgraph', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
  body: JSON.stringify({ query }),
})
  .then((r) => r.json())
  .then((data) => {
    const keys = data.data.nodeOperatorSigningKeys

    keys.length > 0
      ? console.log('Key already exists')
      : console.log("Key doesn't exist yet")
  })
