import { getLidoEvents, getEntityCount } from './utils/index.js'
import { RPC_TIMEOUT } from './config.js'

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
