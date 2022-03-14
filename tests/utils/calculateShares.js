import { gql } from 'graphql-request'
import { subgraphFetch, BigNumber } from './index.js'

export const calculateShares = async (address) => {
  const submissionsQuery = gql`
	query {
	  lidoSubmissions(first: 100000, where: {sender: "${address}"}) {
		amount
		shares
		block
	  }
	
	}
	`

  const transfersInboundQuery = gql`
	query {
		  lidoTransfers (first: 100000, where: {to: "${address}"}) {
			shares
			to
			block
		  }
	}
	`

  const transfersOutboundQuery = gql`
	query {
		  lidoTransfers (first: 100000, where: {from: "${address}"}) {
			shares
			to
			block
		  }
	}
	`

  const submissions = (await subgraphFetch(submissionsQuery)).lidoSubmissions
  const transfersInbound = (await subgraphFetch(transfersInboundQuery))
    .lidoTransfers
  const transfersOutbound = (await subgraphFetch(transfersOutboundQuery))
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

  let shares = BigNumber.from(0)

  for (const item of together) {
    const isStaking = item.type === 'submission'
    const isOut = !isStaking && item.direction === 'outbound'

    const txShares = item.shares || BigNumber.from(0)

    shares = isOut ? shares.sub(txShares) : shares.add(txShares)
  }

  return shares
}
