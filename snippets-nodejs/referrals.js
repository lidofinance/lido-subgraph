const fetcher = require('./helpers/fetcher')

const Big = require('big.js')

const WEI = Big('1e18')
const HUMAN_DECIMALS = 2

const referral = '0x1234'

const query = `query {
	lidoSubmissions(where: {referral:"${referral}"}, orderBy: blockTime, orderDirection: desc) {
    sender
	  amount
    blockTime
  }
}`

// This example is stats-only, doesn't take limits into account
const getTotalAddressReferral = async () => {
  const submissions = (await fetcher(query)).lidoSubmissions

  const total = submissions.reduce((acc, item) => acc.plus(item.amount), Big(0))

  const uniqueReferred = [...new Set(submissions.map((x) => x.sender))]

  console.log(
    referral,
    'referred a total of',
    total.div(WEI).round(HUMAN_DECIMALS).toNumber(),
    'stETH'
  )
  console.log(referral, 'referred', uniqueReferred.length, 'unique addresses')
}

getTotalAddressReferral()
