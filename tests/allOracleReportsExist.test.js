import { getOracleEventNumber, getEntityCount } from './utils'

test('allOracleReportsExist', async () => {
  const ethNumber = await getOracleEventNumber('Completed')
  const subgraphNumber = await getEntityCount('totalRewards')

  expect(subgraphNumber).toEqual(ethNumber)
})
