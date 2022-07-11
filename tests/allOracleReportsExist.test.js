import { getOracleEventNumber, getEntityCount } from './utils/index.js'

test('allOracleReportsExist', async () => {
  const ethNumber = await getOracleEventNumber('Completed')
  const subgraphNumber = await getEntityCount('oracleCompleteds')

  expect(subgraphNumber).toEqual(ethNumber)
}, 20000)
