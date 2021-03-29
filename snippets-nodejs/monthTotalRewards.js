const fetcher = require('./helpers/fetcher')

const Big = require('big.js')

const sub = require('date-fns/sub')

const toHumanDate = (date) => date.toLocaleDateString('en-GB')

const toHumanEthAmount = (value) =>
  Big(value).div(Big('1e18')).toFixed(7).toString()

const monthStartEnd = {
  from: sub(new Date(), { months: 1 }),
  to: new Date(),
}

// Converting JS dates to unix time
const blockTimes = {
  from: Math.round(monthStartEnd.from / 1000),
  to: Math.round(monthStartEnd.to / 1000),
}

const monthRewardsQuery = `query {
	totalRewards(first: 1000, where: {
		blockTime_gte: ${blockTimes.from},
		blockTime_lte: ${blockTimes.to}
	}) {
		totalRewards
	}
}`

const monthRewards = async () => {
  const rewards = (await fetcher(monthRewardsQuery)).totalRewards
  const sum = rewards.reduce(
    (acc, item) => acc.plus(Big(item.totalRewards)),
    Big(0)
  )
  console.log(
    'Rewarded our customers',
    toHumanEthAmount(sum),
    'StETH in the last 30 days',
    toHumanDate(monthStartEnd.from),
    '-',
    toHumanDate(monthStartEnd.to)
  )
}

monthRewards()
