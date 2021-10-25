import { dataSource } from '@graphprotocol/graph-ts'

import { Lido } from '../generated/Lido/Lido'
import { NodeOperatorsRegistry } from '../generated/NodeOperatorsRegistry/NodeOperatorsRegistry'

import { getAddress } from './constants'

let network = dataSource.network()

export const loadLidoContract = (): Lido =>
  Lido.bind(getAddress('Lido', network))

export const loadNosContract = (): NodeOperatorsRegistry =>
  NodeOperatorsRegistry.bind(getAddress('NodeOperatorsRegistry', network))
