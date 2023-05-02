import {
  Transfer as TransferEvent,
  TransferShares as TransferSharesEvent,
} from '../generated/Lido/Lido'
import {
  ExtraDataSubmitted as ExtraDataSubmittedEvent,
  ProcessingStarted as ProcessingStartedEvent,
} from '../generated/AccountingOracle/AccountingOracle'
import { StakingRouter } from '../generated/AccountingOracle/StakingRouter'
import { NodeOperatorsShares, NodeOperatorFees } from '../generated/schema'
import { ZERO, getAddress } from './constants'

import { _loadOracleReport } from './helpers'
import { extractPairedEvent, getParsedEvent, parseEventLogs } from './parser'

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

  // load all SR modules
  const modules = StakingRouter.bind(
    getAddress('STAKING_ROUTER')
  ).getStakingModules()

  // parse all events from tx receipt
  const parsedEvents = parseEventLogs(event, getAddress('LIDO'))

  // extracting all 'Transfer' and 'TransferShares' pairs from tx receipt
  const transferEventPairs = extractPairedEvent(
    parsedEvents,
    'Transfer',
    'TransferShares'
  )

  const burnerAddress = getAddress('BURNER')
  for (let i = 0; i < transferEventPairs.length; i++) {
    const eventTransfer = getParsedEvent<TransferEvent>(
      transferEventPairs[i],
      0
    )
    const eventTransferShares = getParsedEvent<TransferSharesEvent>(
      transferEventPairs[i],
      1
    )

    // creating reward records for NOs to preserve data structure compatibility
    for (let j = 0; j < modules.length; j++) {
      // process transfers from module's addresses, excluding transfers to burner
      if (
        eventTransfer.params.from == modules[j].stakingModuleAddress &&
        eventTransfer.params.to != burnerAddress
      ) {
        let id = eventTransfer.transaction.hash.concatI32(
          eventTransfer.logIndex.toI32()
        )
        // let id = event.transaction.hash.toHex() + '-' + eventTransfer.logIndex.toString()

        // @todo merge NodeOperatorFees & NodeOperatorsShares ?
        const nodeOperatorFees = new NodeOperatorFees(id)
        // Reference to TotalReward entity
        nodeOperatorFees.totalReward = oracleReportEntity.totalReward
        nodeOperatorFees.address = eventTransfer.params.to
        nodeOperatorFees.fee = eventTransfer.params.value
        nodeOperatorFees.save()

        id = event.transaction.hash.concat(eventTransfer.params.to)
        // id = event.transaction.hash.toHex() + '-' + eventTransfer.params.to.toHexString()
        let nodeOperatorShare = NodeOperatorsShares.load(id)
        if (!nodeOperatorShare) {
          nodeOperatorShare = new NodeOperatorsShares(id)
          // Reference to TotalReward entity
          nodeOperatorShare.totalReward = oracleReportEntity.totalReward
          nodeOperatorShare.address = eventTransfer.params.to
          nodeOperatorShare.shares = ZERO
        }
        nodeOperatorShare.shares = nodeOperatorShare.shares.plus(
          eventTransferShares.params.sharesValue
        )
        nodeOperatorShare.save()
      }
    }
  }
}
