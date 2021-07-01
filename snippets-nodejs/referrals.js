const fetcher = require('./helpers/fetcher')

const Big = require('big.js')

const WEI = Big('1e18')
const HUMAN_DECIMALS = 2

const referral = '0x1234'

const generateQuery = (referral, skip) => `query {
  lidoSubmissions(skip: ${skip}, first: 1000, where: {referral:"${referral}"}, orderBy: blockTime, orderDirection: desc) {
    sender
    amount
    blockTime
  }
}`

const fetchToLimits = async (referral) => {
  let skip = 0
  let gotItems = 0
  let results = []

  // We do respect hosted Subgraph's limit here
  while (gotItems === 0 || (gotItems % 1000 === 0 && skip < 6000)) {
    const items = (await fetcher(generateQuery(referral, skip))).lidoSubmissions

    skip += 1000
    gotItems += items.length

    results.push(...items)
  }

  return results
}

// This example is stats-only, doesn't take limits into account
const getTotalAddressReferral = async () => {
  const submissions = await fetchToLimits(referral)

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
