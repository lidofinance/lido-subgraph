import { jest } from '@jest/globals'
import { ethCall, getLastIndexedBlock } from './utils'

jest.setTimeout(20000)

jest.retryTimes(10)

test('isSynced', async () => {
  const currentBlock = parseInt((await ethCall('getBlock', 'latest')).number)
  const acceptedMinimum = currentBlock - 5

  const subgraphBlock = parseInt(await getLastIndexedBlock())

  expect(subgraphBlock).toBeGreaterThanOrEqual(acceptedMinimum)
})
