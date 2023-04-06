import { Address, Bytes } from '@graphprotocol/graph-ts'
import { SetApp } from '../generated/LidoDAO/LidoDAO'
import { AppRepo } from '../generated/LidoDAO/AppRepo'
import { AppVersion } from '../generated/schema'
import { KERNEL_APP_BASES_NAMESPACE, getRepoAddr } from './constants'

export function handleSetApp(event: SetApp): void {
  if (event.params.namespace == KERNEL_APP_BASES_NAMESPACE) {
    const repoAddr = getRepoAddr(event.params.appId)
    // process only known apps
    if (repoAddr) {
      let entity = AppVersion.load(event.params.appId)
      if (!entity) {
        entity = new AppVersion(event.params.appId)
        entity.impl = Bytes.fromHexString('0x00')
      }

      if (entity.impl != event.params.app) {
        const repo = AppRepo.bind(Address.fromString(repoAddr))
        const latest = repo.getLatestForContractAddress(event.params.app)
        const semVer = latest.getSemanticVersion()

        entity.major = semVer[0]
        entity.minor = semVer[1]
        entity.patch = semVer[2]
        entity.impl = event.params.app

        entity.block = event.block.number
        entity.transactionHash = event.transaction.hash
        entity.transactionIndex = event.transaction.index
        entity.save()
      }
    } // else skip all other apps
  }
}
