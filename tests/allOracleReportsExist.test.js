import { getOracleEventNumber, getEntityCount } from './utils'

test('allOracleReportsExist', async () => {
  const ethNumber = await getOracleEventNumber('Completed')
  const subgraphNumber = await getEntityCount('oracleCompleteds')

  expect(subgraphNumber).toEqual(ethNumber)
})
