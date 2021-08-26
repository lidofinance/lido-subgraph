const fetcher = require('./helpers/fetcher')
const Big = require('big.js')

Big.DP = 40
Big.NE = -70000000
Big.PE = 210000000

const address = process.env.ADDRESS

const submissionsQuery = `
query {
  lidoSubmissions(first: 1000, where: {sender: "${address}"}) {
  amount
  shares
  block
  }

}
`

const transfersInboundQuery = `
query {
    lidoTransfers (first: 1000, where: {to: "${address}"}) {
    shares
    to
    block
    }
}
`

const transfersOutboundQuery = `
query {
    lidoTransfers (first: 1000, where: {from: "${address}"}) {
    shares
    to
    block
    }
}
`

const calculateShares = async () => {
  const submissions = (await fetcher(submissionsQuery)).lidoSubmissions
  const transfersInbound = (await fetcher(transfersInboundQuery)).lidoTransfers
  const transfersOutbound = (await fetcher(transfersOutboundQuery))
    .lidoTransfers

  const together = [
    ...submissions.map((x) => ({ ...x, type: 'submission' })),
    ...transfersInbound.map((x) => ({
      ...x,
      type: 'transfer',
      direction: 'inbound',
    })),
    ...transfersOutbound.map((x) => ({
      ...x,
      type: 'transfer',
      direction: 'outbound',
    })),
  ].sort((a, b) => a.block - b.block)

  let shares = Big(0)

  for (item of together) {
    const isStaking = item.type === 'submission'
    const isOut = !isStaking && item.direction === 'outbound'

    shares = isOut ? shares.sub(item.shares) : shares.add(item.shares)

    console.log(
      isStaking ? 'Staking' : isOut ? 'Transfer Outbound' : 'Transfer Inbound',
      item.shares,
      '->',
      shares.toString(),
      item.block
    )
  }

  console.log('Final', shares.toString())
}

calculateShares()
