const fetcher = require('./helpers/fetcher')
const Big = require('big.js')

Big.DP = 40
Big.NE = -70000000
Big.PE = 210000000

const address = process.env.ADDRESS

const toQuery = `
query {
	  lidoTransfers (first: 500, where: {to: "${address}"}) {
		shares
		to
		block
	  }
}
`

const fromQuery = `
query {
	  lidoTransfers (first: 500, where: {from: "${address}"}) {
		shares
		to
		block
	  }
}
`

const calculateShares = async () => {
  const to = (await fetcher(toQuery)).lidoTransfers
  const from = (await fetcher(fromQuery)).lidoTransfers

  const together = [
    ...to.map((x) => ({ ...x, direction: 'to' })),
    ...from.map((x) => ({ ...x, direction: 'from' })),
  ].sort((a, b) => a.block - b.block)

  let shares = Big(0)

  for (item of together) {
    const isTo = item.direction === 'to'

    shares = isTo ? shares.plus(item.shares) : shares.minus(item.shares)

    console.log(isTo ? 'To account' : 'From account', item.shares, item.block)
    console.log(shares.toString())
  }

  console.log('Final', shares.toString())
}

calculateShares()
