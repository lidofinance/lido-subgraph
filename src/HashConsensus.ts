import { FrameConfigSet as FrameConfigSetEvent , HashConsensus} from '../generated/HashConsensus/HashConsensus'
import { NodeOperatorsShares, NodeOperatorFees } from '../generated/schema'
import { _loadOracleConfig, _saveOracleConfig } from './LegacyOracle'
import { ZERO, getAddress } from './constants'


export function handleFrameConfigSet(event: FrameConfigSetEvent): void {

  const chainConfig = HashConsensus.bind(event.address).getChainConfig()

  const entity = _loadOracleConfig()
  entity.epochsPerFrame = event.params.newEpochsPerFrame
  entity.slotsPerEpoch = chainConfig.getSlotsPerEpoch()
  entity.secondsPerSlot = chainConfig.getGenesisTime()
  entity.genesisTime = chainConfig.getGenesisTime()
  _saveOracleConfig(entity, event)
}
