import { Bytes, ethereum, BigInt, log } from '@graphprotocol/graph-ts'
import {
  Totals,
  Shares,
  Stats,
  LidoTransfer,
  TotalReward,
  Holder,
  OracleReport,
  AppVersion,
  NodeOperatorFees,
  NodeOperatorsShares,
} from '../generated/schema'
import {
  CALCULATION_UNIT,
  E27_PRECISION_BASE,
  LIDO_APP_ID,
  NOR_APP_ID,
  ONE,
  ORACLE_APP_ID,
  SECONDS_PER_YEAR,
  PROTOCOL_UPG_IDX_V1_SHARES,
  PROTOCOL_UPG_IDX_V2,
  ZERO,
  ZERO_ADDRESS,
  PROTOCOL_UPG_APP_VERS,
  PROTOCOL_UPG_BLOCKS,
  network,
  ONE_HUNDRED_PERCENT,
  PROTOCOL_UPG_IDX_V2_ADDED_CSM,
  getAddress,
} from './constants'
import {
  Transfer as TransferEvent,
  Transfer,
  TransferShares as TransferSharesEvent,
} from '../generated/Lido/Lido'
import { StakingRouter } from '../generated/AccountingOracle/StakingRouter'
import { extractPairedEvent, getParsedEvent, parseEventLogs } from './parser'

export function _loadLidoTransferEntity(event: Transfer): LidoTransfer {
  const id = event.transaction.hash.concatI32(event.logIndex.toI32())
  // const id = event.transaction.hash.toHex() + '-' + event.logIndex.toString()
  let entity = LidoTransfer.load(id)
  if (!entity) {
    entity = new LidoTransfer(id)
    entity.from = event.params.from
    entity.to = event.params.to
    entity.block = event.block.number
    entity.blockTime = event.block.timestamp
    entity.transactionHash = event.transaction.hash
    entity.transactionIndex = event.transaction.index
    entity.logIndex = event.logIndex

    entity.value = event.params.value
    entity.shares = ZERO
    entity.totalPooledEther = ZERO
    entity.totalShares = ZERO

    // from acc
    entity.sharesBeforeDecrease = ZERO
    entity.sharesAfterDecrease = ZERO
    entity.balanceAfterDecrease = ZERO

    // to acc
    entity.sharesBeforeIncrease = ZERO
    entity.sharesAfterIncrease = ZERO
    entity.balanceAfterIncrease = ZERO

    // entity.mintWithoutSubmission = false
  }
  return entity
}

export function _loadOracleReport(
  refSLot: BigInt,
  event: ethereum.Event,
  create: bool = false
): OracleReport | null {
  let entity = OracleReport.load(refSLot.toString())
  if (!entity && create) {
    entity = new OracleReport(refSLot.toString())
    entity.itemsProcessed = ZERO
    entity.itemsCount = ZERO

    // entity.block = event.block.number
    // entity.blockTime = event.block.timestamp
    // entity.transactionHash = event.transaction.hash
    // entity.logIndex = event.logIndex
  }

  return entity
}

export function _loadTotalRewardEntity(
  event: ethereum.Event,
  create: bool = false
): TotalReward | null {
  let entity = TotalReward.load(event.transaction.hash)
  if (!entity && create) {
    entity = new TotalReward(event.transaction.hash)

    entity.block = event.block.number
    entity.blockTime = event.block.timestamp
    entity.transactionHash = event.transaction.hash
    entity.transactionIndex = event.transaction.index
    entity.logIndex = event.logIndex

    entity.feeBasis = ZERO
    entity.treasuryFeeBasisPoints = ZERO
    entity.insuranceFeeBasisPoints = ZERO
    entity.operatorsFeeBasisPoints = ZERO

    entity.totalRewardsWithFees = ZERO
    entity.totalRewards = ZERO
    entity.totalFee = ZERO
    entity.treasuryFee = ZERO
    entity.insuranceFee = ZERO
    entity.operatorsFee = ZERO
    entity.dust = ZERO
    entity.mevFee = ZERO

    entity.apr = ZERO.toBigDecimal()
    entity.aprRaw = ZERO.toBigDecimal()
    entity.aprBeforeFees = ZERO.toBigDecimal()

    entity.timeElapsed = ZERO

    entity.totalPooledEtherAfter = ZERO
    entity.totalSharesAfter = ZERO

    entity.totalRewardsWithFees = ZERO
    entity.totalRewards = ZERO
    entity.totalFee = ZERO
    entity.operatorsFee = ZERO

    entity.shares2mint = ZERO

    entity.sharesToOperators = ZERO
    entity.sharesToTreasury = ZERO
    entity.sharesToInsuranceFund = ZERO
    entity.dustSharesToTreasury = ZERO
  }

  return entity
}

export function _loadStatsEntity(): Stats {
  let stats = Stats.load('')
  if (!stats) {
    stats = new Stats('')
    stats.uniqueHolders = ZERO
    stats.uniqueAnytimeHolders = ZERO
    stats.lastOracleCompletedId = ZERO
    stats.save()
  }
  return stats
}

export function _loadTotalsEntity(create: bool = false): Totals | null {
  let totals = Totals.load('')
  if (!totals && create) {
    totals = new Totals('')
    totals.totalPooledEther = ZERO
    totals.totalShares = ZERO
  }
  return totals
}

export function _loadSharesEntity(
  id: Bytes,
  create: bool = false
): Shares | null {
  let entity = Shares.load(id)
  if (!entity && create) {
    entity = new Shares(id)
    entity.shares = ZERO
  }
  return entity
}

export function _updateTransferBalances(entity: LidoTransfer): void {
  if (entity.totalShares.isZero()) {
    entity.balanceAfterIncrease = entity.value
    entity.balanceAfterDecrease = ZERO
  } else {
    entity.balanceAfterIncrease = entity
      .sharesAfterIncrease!.times(entity.totalPooledEther)
      .div(entity.totalShares)
    entity.balanceAfterDecrease = entity
      .sharesAfterDecrease!.times(entity.totalPooledEther)
      .div(entity.totalShares)
  }
}

export function _updateTransferShares(entity: LidoTransfer): void {
  // Decreasing from address shares
  if (entity.from != ZERO_ADDRESS) {
    // Address must already have shares, HOWEVER:
    // Someone can and managed to produce events of 0 to 0 transfers
    const sharesFromEntity = _loadSharesEntity(entity.from, true)!
    entity.sharesBeforeDecrease = sharesFromEntity.shares

    if (entity.from != entity.to && !entity.shares.isZero()) {
      // if (sharesFromEntity.shares < entity.shares) {
      //   log.critical(
      //     'negative shares decrease on transfer: from {} to {} sharesBefore {} sharesAfter {} tx {} log {}',
      //     [
      //       entity.from.toHexString(),
      //       entity.to.toHexString(),
      //       sharesFromEntity.shares.toString(),
      //       entity.shares.toString(),
      //       entity.transactionHash.toHexString(),
      //       entity.logIndex.toString()
      //     ]
      //   )
      // }
      assert(
        sharesFromEntity.shares >= entity.shares,
        'negative shares decrease on transfer'
      )
      sharesFromEntity.shares = sharesFromEntity.shares.minus(entity.shares)
      sharesFromEntity.save()
    }
    entity.sharesAfterDecrease = sharesFromEntity.shares
  }
  // Increasing to address shares
  if (entity.to != ZERO_ADDRESS) {
    const sharesToEntity = _loadSharesEntity(entity.to, true)!
    entity.sharesBeforeIncrease = sharesToEntity.shares
    if (entity.to != entity.from && !entity.shares.isZero()) {
      sharesToEntity.shares = sharesToEntity.shares.plus(entity.shares)
      sharesToEntity.save()
    }
    entity.sharesAfterIncrease = sharesToEntity.shares
  }
}

export function _updateHolders(entity: LidoTransfer): void {
  // Saving recipient address as a unique stETH holder
  const stats = _loadStatsEntity()

  // skip zero destination for any case
  if (entity.to != ZERO_ADDRESS && !entity.balanceAfterIncrease!.isZero()) {
    let holder = Holder.load(entity.to)
    if (!holder) {
      holder = new Holder(entity.to)
      holder.address = entity.to
      holder.hasBalance = false

      stats.uniqueAnytimeHolders = stats.uniqueAnytimeHolders.plus(ONE)
    }
    if (!holder.hasBalance) {
      holder.hasBalance = true
      stats.uniqueHolders = stats.uniqueHolders.plus(ONE)
    }
    holder.save()
  }

  if (entity.from != ZERO_ADDRESS) {
    const holder = Holder.load(entity.from)
    if (holder) {
      if (holder.hasBalance && entity.balanceAfterDecrease!.isZero()) {
        holder.hasBalance = false
        stats.uniqueHolders = stats.uniqueHolders.minus(ONE)
      }
      holder.save()
    } // else should not be
  }
  stats.save()
}

export function _calcAPR_v1(
  entity: TotalReward,
  preTotalPooledEther: BigInt,
  postTotalPooledEther: BigInt,
  timeElapsed: BigInt,
  feeBasis: BigInt
): void {
  // Lido v1 deprecated approach
  /**
    aprRaw -> aprBeforeFees -> apr

    aprRaw - APR straight from validator balances without adjustments
    aprBeforeFees - APR compensated for time difference between oracle reports
    apr - Time-compensated APR with fees subtracted
    **/

  // APR without subtracting fees and without any compensations
  entity.aprRaw = postTotalPooledEther
    .toBigDecimal()
    .div(preTotalPooledEther.toBigDecimal())
    .minus(BigInt.fromI32(1).toBigDecimal())
    .times(BigInt.fromI32(100).toBigDecimal())
    .times(BigInt.fromI32(365).toBigDecimal())

  // Time-compensated APR
  // (postTotalPooledEther - preTotalPooledEther) * secondsInYear / (preTotalPooledEther * timeElapsed)
  entity.aprBeforeFees = timeElapsed.isZero()
    ? entity.aprRaw
    : postTotalPooledEther
        .minus(preTotalPooledEther)
        .times(SECONDS_PER_YEAR)
        .toBigDecimal()
        .div(preTotalPooledEther.times(timeElapsed).toBigDecimal())
        .times(BigInt.fromI32(100).toBigDecimal())

  // Subtracting fees
  entity.apr = entity.aprBeforeFees.minus(
    entity.aprBeforeFees
      .times(CALCULATION_UNIT.toBigDecimal())
      .div(feeBasis.toBigDecimal())
      .div(BigInt.fromI32(100).toBigDecimal())
  )
}

export function _calcAPR_v2(
  entity: TotalReward,
  preTotalEther: BigInt,
  postTotalEther: BigInt,
  preTotalShares: BigInt,
  postTotalShares: BigInt,
  timeElapsed: BigInt
): void {
  // Lido v2 new approach
  // https://docs.lido.fi/integrations/api/#last-lido-apr-for-steth

  const preShareRate = preTotalEther
    .toBigDecimal()
    .times(E27_PRECISION_BASE)
    .div(preTotalShares.toBigDecimal())

  const postShareRate = postTotalEther
    .toBigDecimal()
    .times(E27_PRECISION_BASE)
    .div(postTotalShares.toBigDecimal())
  const secondsInYear = BigInt.fromI32(60 * 60 * 24 * 365).toBigDecimal()

  entity.apr = secondsInYear
    .times(postShareRate.minus(preShareRate))
    .times(ONE_HUNDRED_PERCENT)
    .div(preShareRate)
    .div(timeElapsed.toBigDecimal())

  entity.aprRaw = entity.apr
  entity.aprBeforeFees = entity.apr
}

export const checkAppVer = (
  block: BigInt,
  appId: Bytes | null,
  minUpgId: i32
): bool => {
  // first we check block for faster detection
  // if block check fails, try to check app ver
  if (!block.isZero()) {
    const upgBlocks = PROTOCOL_UPG_BLOCKS.get(network)
    if (
      upgBlocks &&
      minUpgId < upgBlocks.length &&
      upgBlocks[minUpgId] != block
    ) {
      // note: we need a block strictly larger than upgBlock, since it
      // is possible that there are transactions in the same block before and after the upgrade
      return upgBlocks[minUpgId] < block
    }
  }

  // if no appId provided or there is no records about appId in DB, assuming check pass
  if (!appId) return true

  const appVer = AppVersion.load(appId)
  if (!appVer) return true

  const upgVers = PROTOCOL_UPG_APP_VERS.get(appId)
  // if no upgrades defined assuming subgraph code fully compatible with deployed contracts
  if (!upgVers || upgVers.length == 0 || minUpgId >= upgVers.length) return true

  // check requested minUpgId is defined and it's contract version is below requested curVer
  return upgVers[minUpgId] <= appVer.major
}

export function isLidoV2(block: BigInt = ZERO): bool {
  return checkAppVer(block, LIDO_APP_ID, PROTOCOL_UPG_IDX_V2)
}

export function isLidoTransferShares(block: BigInt = ZERO): bool {
  return checkAppVer(block, LIDO_APP_ID, PROTOCOL_UPG_IDX_V1_SHARES)
}

export function isLidoAddedCSM(block: BigInt = ZERO): bool {
  return checkAppVer(block, LIDO_APP_ID, PROTOCOL_UPG_IDX_V2_ADDED_CSM)
}

// export function isOracleV2(block: BigInt = ZERO): bool {
//   return checkAppVer(block, ORACLE_APP_ID, UPG_V2_BETA)
// }

// export function isNORV2(block: BigInt = ZERO): bool {
//   return checkAppVer(block, NOR_APP_ID, UPG_V2_BETA)
// }

export function attachNodeOperatorsEntitiesFromTransactionLogsToOracleReport(
  event: ethereum.Event,
  oracleReportEntity: OracleReport
): void {
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

  if (transferEventPairs.length === 0) {
    log.warning('transferEventPairs is empty', [])
  } else {
    log.info('transferEventPairs length - {}', [
      transferEventPairs.length.toString(),
    ])
  }

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
