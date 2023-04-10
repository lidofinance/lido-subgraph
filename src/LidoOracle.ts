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
  _loadOrCreateTotalsEntity,
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
  const parsedEvents = parseEventLogs(event)

  // extracting all 'Transfer' and 'TransferShares' pairs
  const transferEvents = extractPairedEvent(parsedEvents, [
    'Transfer',
    'TransferShares'
  ])

  const burnerAddress = getAddress('BURNER')
  // Totals should exists at this moment
  const totals = _loadOrCreateTotalsEntity()

  for (let i = 0; i < transferEvents.length; i++) {
    let lidoTransferEntity = _loadOrCreateLidoTransferEntity(
      changetype<Transfer>(transferEvents[0][0].event),
      changetype<TransferShares>(transferEvents[0][1].event)
    )

    for (let j = 0; j < modules.length; j++) {
      // process transfers from module's addresses, excluding transfers to burner
      if (
        lidoTransferEntity.from == modules[j].stakingModuleAddress &&
        lidoTransferEntity.to != burnerAddress
      ) {
        lidoTransferEntity.totalPooledEther = totals.totalPooledEther
        lidoTransferEntity.totalShares = totals.totalShares
        // upd account's shares and stats
        _updateTransferShares(lidoTransferEntity)
        _updateHolders(lidoTransferEntity)
        lidoTransferEntity.save()

        let id =
          event.transaction.hash.toHex() +
          '-' +
          lidoTransferEntity.logIndex.toString()
        let nodeOperatorFees = new NodeOperatorFees(id)
        // Reference to TotalReward entity
        nodeOperatorFees.totalReward = oracleReportEntity.hash
        nodeOperatorFees.address = lidoTransferEntity.to
        nodeOperatorFees.fee = lidoTransferEntity.value
        nodeOperatorFees.save()

        let nodeOperatorsShares = new NodeOperatorsShares(id)
        // Reference to TotalReward entity
        nodeOperatorsShares.totalReward = oracleReportEntity.hash
        nodeOperatorsShares.address = lidoTransferEntity.to
        nodeOperatorsShares.shares = lidoTransferEntity.shares
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
