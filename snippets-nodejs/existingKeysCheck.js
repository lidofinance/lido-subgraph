const fetcher = require('./helpers/fetcher')

const pubKey = '0x123'

const query = `query {
	  nodeOperatorSigningKeys(where: {pubkey: "${pubKey}"}) {
		id
		operatorId
		pubkey
	  }
	}`

const findExistingKeys = async () => {
  const keys = (await fetcher(query)).nodeOperatorSigningKeys

  keys.length > 0
    ? console.log('Key already exists')
    : console.log("Key doesn't exist yet")
}

findExistingKeys()
