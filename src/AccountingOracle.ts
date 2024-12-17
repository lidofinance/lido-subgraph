import {
  ExtraDataSubmitted as ExtraDataSubmittedEvent,
  ProcessingStarted as ProcessingStartedEvent,
} from '../generated/AccountingOracle/AccountingOracle'
import {
  _loadOracleReport,
  attachNodeOperatorsEntitiesFromTransactionLogsToOracleReport,
  isLidoAddedCSM,
} from './helpers'

export function handleProcessingStarted(event: ProcessingStartedEvent): void {
  // OracleReport could exists already at this moment in case repeated report for the same epoch
  let oracleReportEntity = _loadOracleReport(event.params.refSlot, event, true)!
  // link to totalReward
  oracleReportEntity.totalReward = event.transaction.hash
  oracleReportEntity.hash = event.params.hash
  oracleReportEntity.save()
}

export function handleExtraDataSubmitted(event: ExtraDataSubmittedEvent): void {
  // OracleReport should exists at this moment
  const oracleReportEntity = _loadOracleReport(event.params.refSlot, event)!

  oracleReportEntity.itemsProcessed = event.params.itemsProcessed
  oracleReportEntity.itemsCount = event.params.itemsCount
  oracleReportEntity.save()

  if (isLidoAddedCSM(event.block.number)) {
    // after CSM release now NodeOperatorFees and Shares entities handled by handleRewardDistributionStateChanged
    return
  }

  attachNodeOperatorsEntitiesFromTransactionLogsToOracleReport(
    event,
    oracleReportEntity
  )
}
