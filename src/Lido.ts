import { BigInt, ethereum, log } from '@graphprotocol/graph-ts'
import {
  Approval,
  BeaconValidatorsUpdated,
  FeeDistributionSet,
  FeeSet,
  Lido,
  Resumed,
  Stopped,
  Submitted,
  TokenRebased,
  Transfer,
  TransferShares
} from '../generated/Lido/Lido'
import {
  LidoSubmission,
  Holder,
  LidoFee,
  CurrentFees,
  LidoFeeDistribution,
  TotalReward,
  NodeOperatorsShares,
  NodeOperatorFees,
  LidoStopped,
  LidoResumed,
  LidoApproval,
  Total
} from '../generated/schema'

import { E27_PRECISION_BASE } from './constants'

import { ZERO, getAddress, ONE, CALCULATION_UNIT, ZERO_ADDRESS } from './constants'
import {
  parseEventLogs,
  extractPairedEvent,
  findPairedEventByLogIndex,
  findParsedEventByName,
  filterParsedEventsByLogIndexRange,
  ParsedEvent
} from './parser'
import {
  _calcAPR_v2,
  _loadOrCreateLidoTransferEntity,
  _loadOrCreateSharesEntity,
  _loadOrCreateStatsEntity,
  // _loadOrCreateTotalRewardEntity,
  _loadOrCreateTotalsEntity,
  _updateHolders,
  _updateTransferBalances,
  _updateTransferShares,
  isLidoTransferShares,
  isLidoV2
} from './helpers'

export function handleSubmitted(event: Submitted): void {
  let entity = new LidoSubmission(event.transaction.hash.toHex() + '-' + event.logIndex.toString())

  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.transactionIndex = event.transaction.index
  entity.logIndex = event.logIndex
  entity.sender = event.params.sender
  entity.amount = event.params.amount
  entity.referral = event.params.referral

  // Loading totals
  const totals = _loadOrCreateTotalsEntity()

  /**
   Use 1:1 ether-shares ratio when:
   1. Nothing was staked yet
   2. Someone staked something, but shares got rounded to 0 eg staking 1 wei
  **/

  // Check if contract has no ether or shares yet
  let shares = totals.totalPooledEther.isZero()
    ? event.params.amount
    : event.params.amount.times(totals.totalShares).div(totals.totalPooledEther)

  // Someone staked > 0 wei, but shares to mint got rounded to 0
  if (shares.equals(ZERO)) {
    shares = event.params.amount
  }
  entity.shares = shares

  if (isLidoTransferShares()) {
    const parsedEvents = parseEventLogs(event, event.address, event.logIndex, event.logIndex.plus(BigInt.fromI32(2)))

    // extracting only 'Transfer' and 'TransferShares' pairs
    const transferEventPairs = extractPairedEvent(parsedEvents, ['Transfer', 'TransferShares'])

    // expecting only one Transfer events pair
    if (transferEventPairs.length == 0) {
      throw new Error('EVENT NOT FOUND: Transfer/TransferShares')
    }

    // const eventTransfer = changetype<Transfer>(transferEvents[0][0].event)
    const eventTransferShares = changetype<TransferShares>(transferEventPairs[0][1].event)
    if (eventTransferShares.params.sharesValue != shares) {
      log.warning(
        'Unexpected shares in TransferShares event! calc shares: {} event shares: {} totalShares: {} totalPooledEth: {} block: {} txHash: {} logIdx(Transfer): {} logIdx(TransferShares): {}',
        [
          shares.toString(),
          eventTransferShares.params.sharesValue.toString(),
          event.block.number.toString(),
          totals.totalShares.toString(),
          totals.totalPooledEther.toString(),
          event.block.number.toString(),
          event.transaction.hash.toHexString(),
          event.logIndex.toString(),
          eventTransferShares.logIndex.toString()
        ]
      )
    }
  }

  const sharesEntity = _loadOrCreateSharesEntity(event.params.sender)

  entity.sharesBefore = sharesEntity.shares
  entity.sharesAfter = entity.sharesBefore.plus(shares)

  entity.totalPooledEtherBefore = totals.totalPooledEther
  entity.totalSharesBefore = totals.totalShares

  // Increasing Total
  totals.totalPooledEther = totals.totalPooledEther.plus(event.params.amount)
  totals.totalShares = totals.totalShares.plus(shares)
  totals.save()

  entity.totalPooledEtherAfter = totals.totalPooledEther
  entity.totalSharesAfter = totals.totalShares

  // Calculating new balance
  entity.balanceAfter = entity.sharesAfter.times(totals.totalPooledEther).div(totals.totalShares)
  entity.save()
}

function _findTransferSharesEvent(parsedEvents: ParsedEvent[], logIndex: BigInt): TransferShares | null {
  // extracting only 'Transfer' and 'TransferShares' pairs and find the item which contains desired event
  const parsedPairedEvent = findPairedEventByLogIndex(
    extractPairedEvent(parsedEvents, ['Transfer', 'TransferShares']),
    logIndex
  )
  if (parsedPairedEvent) {
    return changetype<TransferShares>(parsedPairedEvent[1].event)
  }
  return null
}

export function handleTransfer(event: Transfer): void {
  const entity = _loadOrCreateLidoTransferEntity(event)

  // Entity is already created at this point
  const totals = _loadOrCreateTotalsEntity()
  assert(!totals.totalPooledEther.isZero(), 'Transfer at zero totalPooledEther')

  entity.totalPooledEther = totals.totalPooledEther
  entity.totalShares = totals.totalShares

  // now we should parse the whole tx receipt to be sure pair extraction is accurate
  const parsedEvents = parseEventLogs(event, event.address)

  const eventTransferShares = isLidoTransferShares() ? _findTransferSharesEvent(parsedEvents, event.logIndex) : null
  if (eventTransferShares) {
    entity.shares = eventTransferShares.params.sharesValue
  }

  if (entity.from == ZERO_ADDRESS) {
    // process mint transfers

    const totalRewardsEntity = TotalReward.load(event.transaction.hash)
    if (totalRewardsEntity) {
      // deprecated
      entity.mintWithoutSubmission = false

      if (isLidoV2()) {
        // after V2 upgrade, TotalReward is handled by handleETHDistributed
      } else {
        /**
         * Handling fees during oracle report, in order:
         * 1. Insurance Fund Transfer
         * 2. Node Operator Reward Transfers
         * 3. Treasury Fund Transfer with remaining dust or just rounding dust
         **/

        // If insuranceFee on totalRewards exists, then next transfer is of dust to treasury
        // We need this if treasury and insurance fund is the same address
        if (
          entity.to == getAddress('INSURANCE_FUND') &&
          !totalRewardsEntity.insuranceFeeBasisPoints.isZero() &&
          totalRewardsEntity.insuranceFee.isZero()
        ) {
          // Handling the Insurance Fee transfer event
          totalRewardsEntity.insuranceFee = totalRewardsEntity.insuranceFee.plus(entity.value)

          if (eventTransferShares) {
            assert(entity.shares == totalRewardsEntity.sharesToInsuranceFund, 'Unexpected sharesToInsuranceFund')
          } else {
            entity.shares = totalRewardsEntity.sharesToInsuranceFund
          }

          assert(totalRewardsEntity.totalRewards >= entity.value, 'Total rewards < Insurance fee')
        } else if (entity.to == getAddress('TREASURE')) {
          // Handling the Treasury Fund transfer event

          // Dust exists only when treasuryFeeBasisPoints is 0
          if (totalRewardsEntity.treasuryFeeBasisPoints.isZero()) {
            totalRewardsEntity.dust = totalRewardsEntity.dust.plus(entity.value)
          } else {
            totalRewardsEntity.treasuryFee = totalRewardsEntity.treasuryFee.plus(entity.value)
          }
          const shares = totalRewardsEntity.treasuryFeeBasisPoints.isZero()
            ? totalRewardsEntity.dustSharesToTreasury
            : totalRewardsEntity.sharesToTreasury

          if (eventTransferShares) {
            assert(entity.shares == shares, 'Unexpected sharesToTreasury/dustSharesToTreasury')
          } else {
            entity.shares = shares
          }

          assert(totalRewardsEntity.totalRewards >= entity.value, 'Total rewards < Treasure fee')
        } else {
          // Handling node operator fee transfer to node operator
          const nodeOperatorFees = new NodeOperatorFees(
            event.transaction.hash.toHex() + '-' + event.logIndex.toString()
          )
          // Reference to TotalReward entity
          nodeOperatorFees.totalReward = totalRewardsEntity.id
          nodeOperatorFees.address = entity.to
          nodeOperatorFees.fee = entity.value
          nodeOperatorFees.save()

          // Entity should exists at this point
          const nodeOperatorsShares = NodeOperatorsShares.load(
            event.transaction.hash.toHex() + '-' + entity.to.toHexString()
          )

          if (eventTransferShares) {
            assert(entity.shares == nodeOperatorsShares!.shares, 'Unexpected nodeOperatorsShares')
          } else {
            entity.shares = nodeOperatorsShares!.shares
          }

          totalRewardsEntity.operatorsFee = totalRewardsEntity.operatorsFee.plus(entity.value)
          assert(totalRewardsEntity.totalRewards >= entity.value, 'Total rewards < NO fee')
        }

        //
        totalRewardsEntity.totalRewards = totalRewardsEntity.totalRewards.minus(entity.value)
        totalRewardsEntity.totalFee = totalRewardsEntity.totalFee.plus(entity.value)
        totalRewardsEntity.save()
      }
    } else {
      // transfer after submit
      // deprecated
      entity.mintWithoutSubmission = false

      // prior TransferShares logic
      if (!eventTransferShares) {
        // find submission, it should exists at this point
        // try 3 log items backward
        let submissionEntity: LidoSubmission | null = null
        let prevLogIndex = event.logIndex.minus(ONE)
        for (let i = 0; i < 3; i++) {
          submissionEntity = LidoSubmission.load(event.transaction.hash.toHex() + '-' + prevLogIndex.toString())
          if (!submissionEntity && prevLogIndex.gt(ZERO)) {
            prevLogIndex = prevLogIndex.minus(ONE)
          }
        }
        entity.shares = submissionEntity!.shares
      }
    }
  } else if (!eventTransferShares) {
    // usual transfer without TransferShares event, so calc shares
    entity.shares = entity.value.times(totals.totalShares).div(totals.totalPooledEther)
  }

  // upd account's shares and stats
  _updateTransferShares(entity)
  _updateTransferBalances(entity)
  _updateHolders(entity)
  entity.save()
}

export function handleTokenRebase(event: TokenRebased): void {
  // skip direct handling due to event will be processed as part of handleETHDistributed
  let entity = TotalReward.load(event.transaction.hash)
  if (!entity) {
    return
  }

  // entity.preTotalPooledEther = event.params.preTotalEther
  // entity.postTotalPooledEther = event.params.postTotalEther
  // entity.timeElapsed = event.params.timeElapsed
  // entity.totalShares = event.params.postTotalShares

  _calcAPR_v2(
    entity,
    event.params.preTotalEther,
    event.params.postTotalEther,
    event.params.preTotalShares,
    event.params.postTotalShares,
    event.params.timeElapsed
  )

  entity.save()
}

export function handleFeeSet(event: FeeSet): void {
  const entity = new LidoFee(event.transaction.hash.toHex() + '-' + event.logIndex.toString())
  entity.feeBasisPoints = event.params.feeBasisPoints
  entity.save()

  let current = CurrentFees.load('')
  if (!current) {
    current = new CurrentFees('')
    current.treasuryFeeBasisPoints = ZERO
    current.insuranceFeeBasisPoints = ZERO
    current.operatorsFeeBasisPoints = ZERO
  }

  current.feeBasisPoints = BigInt.fromI32(event.params.feeBasisPoints)
  current.save()
}

export function handleFeeDistributionSet(event: FeeDistributionSet): void {
  const entity = new LidoFeeDistribution(event.transaction.hash.toHex() + '-' + event.logIndex.toString())
  entity.treasuryFeeBasisPoints = event.params.treasuryFeeBasisPoints
  entity.insuranceFeeBasisPoints = event.params.insuranceFeeBasisPoints
  entity.operatorsFeeBasisPoints = event.params.operatorsFeeBasisPoints
  entity.save()

  let current = CurrentFees.load('')
  if (!current) {
    current = new CurrentFees('')
    current.feeBasisPoints = ZERO
  }

  current.treasuryFeeBasisPoints = BigInt.fromI32(event.params.treasuryFeeBasisPoints)
  current.insuranceFeeBasisPoints = BigInt.fromI32(event.params.insuranceFeeBasisPoints)
  current.operatorsFeeBasisPoints = BigInt.fromI32(event.params.operatorsFeeBasisPoints)
  current.save()
}

// @todo merge into LidoProtocolState
export function handleStopped(event: Stopped): void {
  let entity = new LidoStopped(event.transaction.hash.toHex() + '-' + event.logIndex.toString())
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.save()
}

// @todo merge into LidoProtocolState
export function handleResumed(event: Resumed): void {
  let entity = new LidoResumed(event.transaction.hash.toHex() + '-' + event.logIndex.toString())
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.save()
}

export function handleApproval(event: Approval): void {
  let entity = new LidoApproval(event.transaction.hash.toHex() + '-' + event.logIndex.toString())
  entity.owner = event.params.owner
  entity.spender = event.params.spender
  entity.value = event.params.value
  entity.save()
}

/**
 *  WARNING: this handler should exists for Goerli testnet, otherwise subgraph will break
 */

// Handling manual NOs removal on Testnet in txs:
// 6014681 0x45b83117a28ba9f6aed3a865004e85aea1e8611998eaef52ca81d47ac43e98d5
// 6014696 0x5d37899cce4086d7cdf8590f90761e49cd5dcc5c32aebbf2d9a6b2a1c00152c7

// Broken Oracle report after long broken state:
// First val number went down, but then went up all when reports were not happening.
// 7225143 0xde2667f834746bdbe0872163d632ce79c4930a82ec7c3c11cb015373b691643b

export function handleTestnetBlock(block: ethereum.Block): void {
  if (
    block.number.toString() == '6014681' ||
    block.number.toString() == '6014696' ||
    block.number.toString() == '7225143'
    // 7225313
  ) {
    _fixTotalPooledEther()
  }
}

// Handling validators count correction during the upgrade:
// 7127807 0xa9111b9bf19777ca08902fbd9c1dc8efc7a5bf61766f92bd469b522477257195
export function handleBeaconValidatorsUpdated(_event: BeaconValidatorsUpdated): void {
  _fixTotalPooledEther()
}

function _fixTotalPooledEther(): void {
  const realPooledEther = Lido.bind(getAddress('LIDO')).getTotalPooledEther()
  const totals = _loadOrCreateTotalsEntity()
  totals.totalPooledEther = realPooledEther
  totals.save()
}
