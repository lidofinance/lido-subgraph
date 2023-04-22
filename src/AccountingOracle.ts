import { Transfer as TransferEvent, TransferShares as TransferSharesEvent } from '../generated/Lido/Lido'
import {
  ExtraDataSubmitted as ExtraDataSubmittedEvent,
  ProcessingStarted as ProcessingStartedEvent
} from '../generated/AccountingOracle/AccountingOracle'
import { StakingRouter } from '../generated/AccountingOracle/StakingRouter'
import { NodeOperatorsShares, NodeOperatorFees } from '../generated/schema'
import { ZERO, getAddress } from './constants'

import {
  _loadOracleReport,
  _loadTotalRewardEntity,
  _updateHolders,
  _updateTransferShares,
  isOracleV2
} from './helpers'
import { extractPairedEvent, getParsedEvent, parseEventLogs } from './parser'

export function handleProcessingStarted(event: ProcessingStartedEvent): void {
  // OracleReport could exists already at this moment in case repeated report for some epoch
  let oracleReportEntity = _loadOracleReport(event.params.refSlot)
  // link to totalReward
  oracleReportEntity.totalReward = event.transaction.hash
  oracleReportEntity.hash = event.params.hash
  oracleReportEntity.save()
}

export function handleExtraDataSubmitted(event: ExtraDataSubmittedEvent): void {
  // OracleReport should exists at this moment
  const oracleReportEntity = _loadOracleReport(event.params.refSlot)

  oracleReportEntity.itemsProcessed = event.params.itemsProcessed
  oracleReportEntity.itemsCount = event.params.itemsCount
  oracleReportEntity.save()

  // load all SR modules
  const modules = StakingRouter.bind(getAddress('STAKING_ROUTER')).getStakingModules()

  // parse all events from tx receipt
  const parsedEvents = parseEventLogs(event, getAddress('LIDO'))

  // extracting all 'Transfer' and 'TransferShares' pairs from tx receipt
  const transferEventPairs = extractPairedEvent(parsedEvents, 'Transfer', 'TransferShares')

  const burnerAddress = getAddress('BURNER')
  for (let i = 0; i < transferEventPairs.length; i++) {
    const eventTransfer = getParsedEvent<TransferEvent>(transferEventPairs[0], 0)
    const eventTransferShares = getParsedEvent<TransferSharesEvent>(transferEventPairs[0], 1)

    // creating reward records for NOs to preserve data structure compatibility
    for (let j = 0; j < modules.length; j++) {
      // process transfers from module's addresses, excluding transfers to burner
      if (eventTransfer.params.from == modules[j].stakingModuleAddress && eventTransfer.params.to != burnerAddress) {
        const nodeOperatorFees = new NodeOperatorFees(
          eventTransfer.transaction.hash.concatI32(eventTransfer.logIndex.toI32())
        )
        // Reference to TotalReward entity
        nodeOperatorFees.totalReward = oracleReportEntity.hash
        nodeOperatorFees.address = eventTransfer.params.to
        nodeOperatorFees.fee = eventTransfer.params.value
        nodeOperatorFees.save()

        const nodeOperatorsShares = new NodeOperatorsShares(event.transaction.hash.concat(eventTransfer.params.to))
        // Reference to TotalReward entity
        nodeOperatorsShares.totalReward = oracleReportEntity.hash
        nodeOperatorsShares.address = eventTransfer.params.to
        nodeOperatorsShares.shares = eventTransferShares.params.sharesValue
        nodeOperatorsShares.save()
        break
      }
    }
  }
}
