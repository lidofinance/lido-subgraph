import { Lido } from '../generated/Lido/Lido'
import { NodeOperatorsRegistry } from '../generated/NodeOperatorsRegistry/NodeOperatorsRegistry'
import { StakingRouter } from '../generated/StakingRouter/StakingRouter'

import { getAddress } from './constants'

export const loadLidoContract = (): Lido => Lido.bind(getAddress('LIDO'))

export const loadNORContract = (): NodeOperatorsRegistry =>
  NodeOperatorsRegistry.bind(getAddress('NO_REGISTRY'))

export const loadSRContract = (): StakingRouter =>
  StakingRouter.bind(getAddress('STAKING_ROUTER'))
