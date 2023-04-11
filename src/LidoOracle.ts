import { BigInt } from '@graphprotocol/graph-ts'
import {
  Completed,
  ContractVersionSet,
  PostTotalShares
} from '../generated/LidoOracle/LidoOracle'
import {
  ExtraDataSubmitted,
  ProcessingStarted
} from '../generated/AccountingOracle/AccountingOracle'
import {
  OracleCompleted,
  TotalReward,
  OracleVersion,
  NodeOperatorsShares,
  NodeOperatorFees
} from '../generated/schema'
import {
  handleCompleted as handleCompleted_v1,
  handlePostTotalShares as handlePostTotalShares_v1,
  handleAllowedBeaconBalanceRelativeDecreaseSet,
  handleAllowedBeaconBalanceAnnualRelativeIncreaseSet,
  handleBeaconReportReceiverSet,
  handleExpectedEpochIdUpdated,
  handleBeaconSpecSet,
  handleBeaconReported,
  handleQuorumChanged,
  handleMemberRemoved,
  handleMemberAdded
} from './v1/LidoOracle'

import { getAddress } from './constants'

import {
  _loadOrCreateLidoTransferEntity,
  _loadOrCreateOracleReport,
  _loadOrCreateTotalRewardEntity,
  _updateHolders,
  _updateTransferShares,
  isOracleV2
} from './helpers'
import { loadSRContract } from './contracts'
import { extractPairedEvent, parseEventLogs } from './parser'
import { Transfer, TransferShares } from '../generated/Lido/Lido'

export function handleProcessingStarted(event: ProcessingStarted): void {
  // OracleReport could exists already at this moment
  let oracleReportEntity = _loadOrCreateOracleReport(event.params.refSlot)
  // link to totalReward
  oracleReportEntity.totalReward = event.transaction.hash
  oracleReportEntity.refSlot = event.params.refSlot
  oracleReportEntity.hash = event.params.hash
  oracleReportEntity.save()
}

export function handleExtraDataSubmitted(event: ExtraDataSubmitted): void {
  // OracleReport should exists at this moment
  let oracleReportEntity = _loadOrCreateOracleReport(event.params.refSlot)

  oracleReportEntity.itemsProcessed = event.params.itemsProcessed
  oracleReportEntity.itemsCount = event.params.itemsCount
  oracleReportEntity.save()

  let modules = loadSRContract().getStakingModules()

  // parse all events from tx receipt
  const parsedEvents = parseEventLogs(event, getAddress('LIDO'))

  // extracting all 'Transfer' and 'TransferShares' pairs
  const transferEventPairs = extractPairedEvent(parsedEvents, [
    'Transfer',
    'TransferShares'
  ])

  const burnerAddress = getAddress('BURNER')
  for (let i = 0; i < transferEventPairs.length; i++) {
    const eventTransfer = changetype<Transfer>(transferEventPairs[0][0].event)
    const eventTransferShares = changetype<TransferShares>(
      transferEventPairs[0][1].event
    )

    for (let j = 0; j < modules.length; j++) {
      // process transfers from module's addresses, excluding transfers to burner
      if (
        eventTransfer.params.from == modules[j].stakingModuleAddress &&
        eventTransfer.params.to != burnerAddress
      ) {
        const nodeOperatorFees = new NodeOperatorFees(
          eventTransfer.transaction.hash.toHex() +
            '-' +
            eventTransfer.logIndex.toString()
        )
        // Reference to TotalReward entity
        nodeOperatorFees.totalReward = oracleReportEntity.hash
        nodeOperatorFees.address = eventTransfer.params.to
        nodeOperatorFees.fee = eventTransfer.params.value
        nodeOperatorFees.save()

        const nodeOperatorsShares = new NodeOperatorsShares(
          oracleReportEntity.hash.toHex() +
            '-' +
            eventTransfer.params.to.toHexString()
        )
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

export function handleCompleted(event: Completed): void {
  if (!isOracleV2()) {
    return handleCompleted_v1(event)
  }

  // @todo
}

export function handlePostTotalShares(event: PostTotalShares): void {
  if (!isOracleV2()) {
    return handlePostTotalShares_v1(event)
  }
}

export function handleContractVersionSet(event: ContractVersionSet): void {
  let entity = new OracleVersion(
    event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  )

  entity.version = event.params.version

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp

  entity.save()
}

/// lido v1 events
export {
  handleAllowedBeaconBalanceRelativeDecreaseSet,
  handleAllowedBeaconBalanceAnnualRelativeIncreaseSet,
  handleBeaconReportReceiverSet,
  handleExpectedEpochIdUpdated,
  handleBeaconSpecSet,
  handleBeaconReported,
  handleQuorumChanged,
  handleMemberRemoved,
  handleMemberAdded
}
