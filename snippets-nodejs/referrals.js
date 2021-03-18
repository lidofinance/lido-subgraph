const fetcher = require('./helpers/fetcher')

const referral = '0x1234'

const query = `query {
	lidoSubmissions(where: {referral:"${referral}"}) {
	  amount
  }
}`

const getTotalAddressReferral = async () => {
  const submissions = (await fetcher(query)).lidoSubmissions

  const total = submissions.reduce(
    (acc, item) => acc + parseInt(item.amount),
    0
  )
  console.log('This referrer ID referred a total of:', total)
}

getTotalAddressReferral()
