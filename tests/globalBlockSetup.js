import { GRAPH, RPC } from './config.js'
import { getLastIndexedBlock, getRpcNetwork } from './utils/index.js'

if (GRAPH) {
  process.env.BLOCK = await getLastIndexedBlock()
} else {
  console.info('BLOCK env was not set as there is no GRAPH provided.')
}

if (RPC) {
  const networkName = (await getRpcNetwork()).name
  process.env.NETWORK = networkName === 'homestead' ? 'mainnet' : networkName
} else {
  console.info('NETWORK env was not set as there is no RPC provided.')
}
