import { getAllOraclesReports, getOracleCompletedEvents } from './utils'

test('allOracleReportsExist', async () => {
  const oracleReportsNumber = (await getOracleCompletedEvents()).length
  const subgraphReportsNumber = (await getAllOraclesReports()).length

  expect(subgraphReportsNumber).toEqual(oracleReportsNumber)
})
