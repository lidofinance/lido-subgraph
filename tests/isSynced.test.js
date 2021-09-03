import { ethCall, getLastIndexedBlock } from './utils'

test('isSynced', async () => {
  const currentBlock = (await ethCall('getBlock', 'latest')).number
  const subgraphTotalShares = await getLastIndexedBlock()

  expect(subgraphTotalShares).toEqual(currentBlock)
})
