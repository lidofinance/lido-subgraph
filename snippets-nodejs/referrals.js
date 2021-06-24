const fetcher = require('./helpers/fetcher')

const Big = require('big.js')

const referral = '0x1234'

const query = `query {
	lidoSubmissions(where: {referral:"${referral}"}) {
    sender
	  amount
  }
}`

const getTotalAddressReferral = async () => {
  const submissions = (await fetcher(query)).lidoSubmissions

  const total = submissions.reduce((acc, item) => acc.plus(item.amount), Big(0))

  const uniqueReferred = [...new Set(submissions.map((x) => x.sender))]

  console.log(
    referral,
    'referred a total of',
    total.div(1e18).round(1).toNumber(),
    'stETH'
  )
  console.log(referral, 'referred', uniqueReferred.length, 'unique addresses')
}

getTotalAddressReferral()
