import { GRAPH, RPC } from './config.js'
import {
  getLastIndexedBlock,
  getRpcNetwork,
  getLastRpcBlock,
  checkIfLimited,
} from './utils/index.js'

if (GRAPH) {
  process.env.BLOCK = parseInt(await getLastIndexedBlock()) - 10 // small buffer (2 mins)
  process.env.LIMITED = await checkIfLimited()
} else {
  console.info(
    'BLOCK and LIMITED env was not set as there is no GRAPH provided.'
  )
}

if (RPC) {
  const networkName = await getRpcNetwork()
  const lastRpcBlock = await getLastRpcBlock()
  process.env.NETWORK = networkName === 'homestead' ? 'mainnet' : networkName
  process.env.RPC_BLOCK = lastRpcBlock
} else {
  console.info('NETWORK env was not set as there is no RPC provided.')
}
