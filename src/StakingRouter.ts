import { WithdrawalCredentialsSet as WithdrawalCredentialsSetEvent } from '../generated/StakingRouter/StakingRouter'
import {
  _loadLidoConfig,
  // _saveLidoConfig
} from './Lido'

export function handleWithdrawalCredentialsSet(event: WithdrawalCredentialsSetEvent): void {
  const entity = _loadLidoConfig()
  entity.withdrawalCredentials = event.params.withdrawalCredentials
  entity.wcSetBy = event.params.setBy
  entity.save()
  //_saveLidoConfig(entity, event)
}
