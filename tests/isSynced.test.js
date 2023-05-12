import { jest } from '@jest/globals'
import { getBlock, getRpcBlock } from './config.js'

jest.setTimeout(20000)
jest.retryTimes(3)

test('isSyncedLoose', async () => {
  const currentBlock = getRpcBlock()
  const subgraphBlock = getBlock()
  const acceptedMinimum = currentBlock - 50

  expect(subgraphBlock).toBeGreaterThanOrEqual(acceptedMinimum)
})
