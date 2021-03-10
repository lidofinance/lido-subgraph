const Big = require('big.js')

const fetcher = require('./helpers/fetcher')

const fromUnixTime = require('date-fns/fromUnixTime')
const formatRelative = require('date-fns/formatRelative')
const lightFormat = require('date-fns/lightFormat')

const client = '0x1234'

const userTransfersQuery = `query {
	lidoTransfers (first: 1000, where: {to:"${client}"}) {
		shares
    block
    blockTime
	}
}`

const totalRewardsQuery = `query {
  totalRewards (first: 1000) {
    totalRewards
    block
    blockTime
  }
}`

const sharesToStethRatioQuery = `query {
  sharesToStethRatios (first: 1000) {
    totalShares
    block
    blockTime
  }
}`

// Add human-friendly dates to our events
const epochFullDaysAdder = (events) =>
  events.map((x) => {
    const parsedDate = fromUnixTime(x.blockTime)
    return {
      ...x,
      epochFullDays: Math.floor(x.blockTime / 60 / 60 / 24),
      relative: formatRelative(parsedDate, new Date()),
      date: lightFormat(parsedDate, 'yyyy-MM-dd'),
    }
  })

// Merge objects by full days of blocktimes
const mergeByFullDays = (a1, a2) =>
  a1.map((itm) => ({
    ...a2.find((item) => item.epochFullDays === itm.epochFullDays && item),
    ...itm,
  }))

const calculate = async () => {
  {
    const lidoTransfers = epochFullDaysAdder(
      (await fetcher(userTransfersQuery)).lidoTransfers
    )
    const totalRewards = epochFullDaysAdder(
      (await fetcher(totalRewardsQuery)).totalRewards
    )
    const sharesToStethRatios = epochFullDaysAdder(
      (await fetcher(sharesToStethRatioQuery)).sharesToStethRatios
    )

    // Match shares to steth ratio entities with rewards
    const sharesWithRewards = mergeByFullDays(
      sharesToStethRatios,
      totalRewards
    ).sort((a, b) => a.blockTime - b.blockTime)

    // Start with no shares when there was no transfers yet
    let currentShares = Big(0)

    for (let x of sharesWithRewards) {
      // Find all transfers before this blocktime and choose latest
      const usefulTransfers = lidoTransfers
        .filter((transfer) => transfer.blockTime < x.blockTime)
        .sort((t1, t2) => t2.blockTime - t1.blockTime)
      if (
        usefulTransfers.length &&
        !Big(usefulTransfers[0].shares).eq(currentShares)
      ) {
        const first = usefulTransfers[0]
        currentShares = currentShares.plus(Big(first.shares))
      }

      // rewards per report = (address' shares at the moment of report)*(totalRewards)/(totalShares at the moment of reports)

      const rewards = currentShares.times(
        Big(x.totalRewards).div(Big(x.totalShares))
      )

      if (!rewards.eq(Big(0))) {
        // console.log(x.date, "rewards", rewards.toFixed(0).toString());
        console.log(x.date, rewards.div(Big('1e18')).toFixed(10).toString())
      }
    }
  }
}

calculate()
