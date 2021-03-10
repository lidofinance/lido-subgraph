const fetcher = require('./helpers/fetcher')

const userTransfersQuery = `query {
	lidoTransfers (first: 1000) {
		from
    to
	}
}`

const finder = async () => {
  const transfers = (await fetcher(userTransfersQuery)).lidoTransfers

  const grouped = transfers.reduce((a, b) => {
    var i = a.findIndex((x) => x.to === b.to)
    return i === -1 ? a.push({ to: b.to, times: 1 }) : a[i].times++, a
  }, [])

  const sorted = grouped.sort((a, b) => b.times - a.times)

  const withoutSingle = sorted.filter((x) => x.times > 1 && x.times < 10)

  console.log(withoutSingle)
}

finder()
