const fetcher = require('./helpers/fetcher')
const fs = require('fs')

const genQuery = (skip) => `
query {
	  lidoTransfers (first: 1000, skip: ${skip}) {
		from
		to
	  }
	}
`

const holdersFinder = async () => {
  const unique = new Set()

  let skip = 0
  let gotItems = 0

  // Make sure we are using self-hosted Graph nodes with no limits or this will fail
  while (gotItems === 0 || gotItems % 1000 === 0) {
    const items = (await fetcher(genQuery(skip))).lidoTransfers

    skip += 1000
    gotItems += items.length

    for (item of items) {
      unique.add(item.from)
      unique.add(item.to)
    }

    console.log('Fetched', gotItems)
  }

  const filtered = Array.from(unique).filter(
    (x) => x !== '0x0000000000000000000000000000000000000000'
  )

  console.log('Found', filtered.length, 'unique addresses of stETH holders')

  await fs.promises.writeFile('withContracts.json', JSON.stringify(filtered))
}

holdersFinder()
