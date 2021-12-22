import { jest } from '@jest/globals'
import { ethCall, getLastIndexedBlock } from './utils'

jest.setTimeout(20000)

jest.retryTimes(20)

test('isSynced', async () => {
  const currentBlock = parseInt((await ethCall('getBlock', 'latest')).number)
  const acceptedMinimum = currentBlock - 2

  const subgraphBlock = parseInt(await getLastIndexedBlock())

  expect(subgraphBlock).toBeGreaterThanOrEqual(acceptedMinimum)
})
