import networks from '../networks.json'
export const RPC = process.env.RPC
export const GRAPH = process.env.GRAPH
export const GRAPH_BASIC_AUTH_USER = process.env.GRAPH_BASIC_AUTH_USER || ''
export const GRAPH_BASIC_AUTH_PASSWORD =
  process.env.GRAPH_BASIC_AUTH_PASSWORD || ''
export const GRAPH_AUTH_COOKIE = process.env.GRAPH_AUTH_COOKIE || ''
/**
Timeout is for testnet - needs to be adjusted for mainnet or when transaction count increases.
**/
export const RPC_TIMEOUT = process.env.RPC_TIMEOUT || 60 * 1000

export const getBlock = () => parseInt(process.env.BLOCK)
export const getNetwork = () => process.env.NETWORK || ''
export const getRpcBlock = () => parseInt(process.env.RPC_BLOCK)
export const getIsMainnet = () => getNetwork() === 'mainnet'
export const getIsLimited = () => process.env.LIMITED === 'true'

export const getContractAddress = (name = '') => {
  const network = getNetwork()
  if (!networks[network]) {
    throw new Error(`No contracts defined for network '${network}'`)
  }
  const {
    [name]: { address },
  } = networks[network] || {}
  if (!address) {
    throw new Error(
      `No address defined for contract '${name}' at network '${network}'`
    )
  }
  return address
}
