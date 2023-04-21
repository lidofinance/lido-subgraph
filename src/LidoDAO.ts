import { Address, Bytes } from '@graphprotocol/graph-ts'
import { SetApp } from '../generated/LidoDAO/LidoDAO'
import { AppRepo } from '../generated/LidoDAO/AppRepo'
import { AppVersion } from '../generated/schema'
import { KERNEL_APP_BASES_NAMESPACE, APP_REPOS, ZERO_ADDRESS } from './constants'

export function handleSetApp(event: SetApp): void {
  if (event.params.namespace == KERNEL_APP_BASES_NAMESPACE) {
    const repoAddr = APP_REPOS.get(event.params.appId)
    // process only known apps
    if (repoAddr) {
      let entity = AppVersion.load(event.params.appId)
      if (!entity) {
        entity = new AppVersion(event.params.appId)
        entity.impl = ZERO_ADDRESS
      }

      // updating only in case of a new contract address
      if (entity.impl != event.params.app) {
        const repo = AppRepo.bind(Address.fromString(repoAddr))
        const latest = repo.getLatestForContractAddress(event.params.app)
        const semVer = latest.getSemanticVersion()

        entity.major = semVer[0]
        entity.minor = semVer[1]
        entity.patch = semVer[2]
        entity.impl = event.params.app

        entity.block = event.block.number
        entity.blockTime = event.block.timestamp
        entity.transactionHash = event.transaction.hash
        entity.logIndex = event.logIndex
        entity.save()
      }
    } // else skip all other apps
  }
}
