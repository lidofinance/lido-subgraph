import { ethCall, getLastIndexedBlock } from './utils'

test('isSynced', async () => {
  const currentBlock = (await ethCall('getBlock', 'latest')).number
  const subgraphBlock = await getLastIndexedBlock()

  expect(subgraphBlock).toEqual(currentBlock)
})
