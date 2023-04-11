import { BigInt, Address } from '@graphprotocol/graph-ts'
import { WithdrawalCredentialsSet } from '../generated/StakingRouter/StakingRouter'
import { LidoWithdrawalCredential } from '../generated/schema'

export function handleWithdrawalCredentialsSet(
  event: WithdrawalCredentialsSet
): void {
  let entity = LidoWithdrawalCredential.load(event.params.withdrawalCredentials)
  if (!entity) {
    entity = new LidoWithdrawalCredential(event.params.withdrawalCredentials)

    entity.withdrawalCredentials = event.params.withdrawalCredentials
    entity.setBy = event.params.setBy
    entity.block = event.block.number
    entity.blockTime = event.block.number
    entity.save()
  }
}
