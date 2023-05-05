import { getLidoOracleEvents, getEntityCount } from './utils/index.js'
import { RPC_TIMEOUT } from './config.js'

test(
  'allOracleReportsExist',
  async () => {
    const ethNumber = (await getLidoOracleEvents('Completed')).length
    const subgraphNumber = await getEntityCount('oracleCompleteds')

    expect(subgraphNumber).toEqual(ethNumber)
  },
  RPC_TIMEOUT
) // very long on testnet
