import { RPC_SYNC_BLOCK } from './config.js'
import { getLastIndexedBlock } from './utils/index.js'

if (RPC_SYNC_BLOCK) {
  const block = await getLastIndexedBlock()
  process.env.BLOCK = block
}
