import { getLastIndexedBlock, getRpcNetwork } from './utils/index.js'

process.env.BLOCK = await getLastIndexedBlock()

const networkName = (await getRpcNetwork()).name
process.env.NETWORK = networkName === 'homestead' ? 'mainnet' : networkName
