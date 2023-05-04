import { getLidoEvents, getEntityCount } from './utils/index.js'

/**
Timeout is for testnet - needs to be adjusted for mainnet or when transaction count increases.
**/

const RPC_TIMEOUT = 60 * 1000

test(
  'allSubmissionsExist',
  async () => {
    const ethNumber = (await getLidoEvents('Submitted')).length
    const subgraphNumber = await getEntityCount('lidoSubmissions')

    expect(subgraphNumber).toEqual(ethNumber)
  },
  RPC_TIMEOUT
)

test(
  'allTransfersExist',
  async () => {
    const ethNumber = (await getLidoEvents('Transfer')).length
    const subgraphNumber = await getEntityCount('lidoTransfers')

    expect(subgraphNumber).toEqual(ethNumber)
  },
  RPC_TIMEOUT
)
