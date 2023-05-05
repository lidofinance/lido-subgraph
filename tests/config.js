export const RPC = process.env.RPC
export const GRAPH = process.env.GRAPH
export const GRAPH_BASIC_AUTH_USER = process.env.GRAPH_BASIC_AUTH_USER || ''
export const GRAPH_BASIC_AUTH_PASSWORD =
  process.env.GRAPH_BASIC_AUTH_PASSWORD || ''
export const GRAPH_AUTH_COOKIE = process.env.GRAPH_AUTH_COOKIE || ''
export const LIDO_ADDRESS = process.env.LIDO_ADDRESS
export const NOP_ADDRESS = process.env.NOP_ADDRESS
export const ARAGON_ADDRESS = process.env.ARAGON_ADDRESS
export const EASYTRACK_ADDRESS = process.env.EASYTRACK_ADDRESS
export const DSM_ADDRESS = process.env.DSM_ADDRESS
/**
Timeout is for testnet - needs to be adjusted for mainnet or when transaction count increases.
**/
export const RPC_TIMEOUT = process.env.RPC_TIMEOUT || 60 * 1000

export const getBlock = () => parseInt(process.env.BLOCK)
export const getNetwork = () => process.env.NETWORK
export const getIsMainnet = () => getNetwork() === 'mainnet'
export const getIsLimited = () => process.env.LIMITED === 'true'
