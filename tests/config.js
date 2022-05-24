export const RPC = process.env.RPC
export const GRAPH = process.env.GRAPH
export const LIDO_ADDRESS = process.env.LIDO_ADDRESS

export const getBlock = () => parseInt(process.env.BLOCK)
export const getNetwork = () => process.env.NETWORK
export const getIsMainnet = () => getNetwork() === 'mainnet'
