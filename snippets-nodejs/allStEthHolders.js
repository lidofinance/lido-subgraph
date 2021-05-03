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

  console.log('Found', unique.size, 'unique addresses of stETH holders')

  await fs.promises.writeFile('unique.json', JSON.stringify(Array.from(unique)))
}

holdersFinder()
