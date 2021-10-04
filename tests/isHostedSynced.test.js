import { ethCall, getHostedLastIndexedBlock } from './utils'

test('isHostedSynced', async () => {
  const currentBlock = parseInt((await ethCall('getBlock', 'latest')).number)
  const acceptedMinimum = currentBlock - 1000 // ~ 3.5 hours of blocks

  const subgraphBlock = parseInt(await getHostedLastIndexedBlock())

  expect(subgraphBlock).toBeGreaterThanOrEqual(acceptedMinimum)
})
