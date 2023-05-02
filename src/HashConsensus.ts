import {
  FrameConfigSet as FrameConfigSetEvent,
  HashConsensus
} from '../generated/HashConsensus/HashConsensus'
import { _loadOracleConfig } from './LegacyOracle'

export function handleFrameConfigSet(event: FrameConfigSetEvent): void {
  const chainConfig = HashConsensus.bind(event.address).getChainConfig()

  const entity = _loadOracleConfig()
  entity.epochsPerFrame = event.params.newEpochsPerFrame
  entity.slotsPerEpoch = chainConfig.getSlotsPerEpoch()
  entity.secondsPerSlot = chainConfig.getGenesisTime()
  entity.genesisTime = chainConfig.getGenesisTime()
  entity.save()
}
