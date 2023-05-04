import { getLidoOracleEvents, getEntityCount } from './utils/index.js'

test('allOracleReportsExist', async () => {
  const ethNumber = (await getLidoOracleEvents('Completed')).length
  const subgraphNumber = await getEntityCount('oracleCompleteds')

  expect(subgraphNumber).toEqual(ethNumber)
}, 30000) // very long on testnet
