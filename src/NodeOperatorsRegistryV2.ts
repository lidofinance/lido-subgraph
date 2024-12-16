import { RewardDistributionStateChanged as RewardDistributionStateChangedEvent } from '../generated/NodeOperatorsRegistryV2/NodeOperatorsRegistryV2'
import { AccountingOracle } from '../generated/AccountingOracle/AccountingOracle'
import { getAddress } from './constants'
import {
  _loadOracleReport,
  attachNodeOperatorsEntitiesFromTransactionLogsToOracleReport,
} from './helpers'
import { log } from '@graphprotocol/graph-ts'

export function handleRewardDistributionStateChanged(
  event: RewardDistributionStateChangedEvent
): void {
  // event Transfer and TransferShare only placed in transaction on final state Distributed (= 2)
  if (event.params.state !== 2) {
    return
  }

  const accountingOracle = AccountingOracle.bind(
    getAddress('ACCOUNTING_ORACLE')
  )
  const refSlot = accountingOracle.try_getLastProcessingRefSlot()

  if (refSlot.reverted) {
    log.warning(
      `[RewardDistributionStateChangedEvent] accountingOracle.try_getLastProcessingRefSlot reverted`,
      []
    )
    return
  }

  const oracleReportEntity = _loadOracleReport(refSlot.value, event)

  if (!oracleReportEntity) {
    log.warning(
      `[RewardDistributionStateChangedEvent] oracleReportEntity is not found with id ${refSlot.value}`,
      []
    )
    return
  }

  attachNodeOperatorsEntitiesFromTransactionLogsToOracleReport(
    event,
    oracleReportEntity
  )
}
