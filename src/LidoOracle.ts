import { Completed, PostTotalShares } from '../generated/LidoOracle/LidoOracle'
import { NodeOperatorsRegistry } from '../generated/LidoOracle/NodeOperatorsRegistry'
import { CurrentFees, NodeOperatorsShares, OracleCompleted, TotalReward } from '../generated/schema'
import {
  CALCULATION_UNIT,
  DEPOSIT_AMOUNT,
  ONE,
  ZERO,
  getAddress
} from './constants'

import {
  _calcAPR_v1,
  // _loadOrCreateOracleReport,
  _loadOrCreateStatsEntity,
  _loadOrCreateTotalRewardEntity,
  _loadOrCreateTotalsEntity,
  _updateHolders,
  _updateTransferShares,
  isLidoV2,
  isOracleV2
} from './helpers'
import { ELRewardsReceived, MevTxFeeReceived, TokenRebased } from '../generated/Lido/Lido'
import { ParsedEvent, findParsedEventByName, parseEventLogs } from './parser'

function _findELRewardsReceivedEvent(parsedEvents: ParsedEvent[]): ELRewardsReceived | null {
  const parsedEvent = findParsedEventByName(parsedEvents, 'ELRewardsReceived')
  if (parsedEvent) {
    return changetype<ELRewardsReceived>(parsedEvent.event)
  }
  return null
}

function _findPostTotalSharesEvent(parsedEvents: ParsedEvent[]): PostTotalShares | null {
  const parsedEvent = findParsedEventByName(parsedEvents, 'PostTotalShares')
  if (parsedEvent) {
    return changetype<PostTotalShares>(parsedEvent.event)
  }
  return null
}
function _findMevTxFeeReceivedEvent(parsedEvents: ParsedEvent[]): MevTxFeeReceived | null {
  const parsedEvent = findParsedEventByName(parsedEvents, 'MevTxFeeReceived')
  if (parsedEvent) {
    return changetype<MevTxFeeReceived>(parsedEvent.event)
  }
  return null
}

export function handleCompleted(event: Completed): void {
  if (isLidoV2()) {
    return
  }

  // todo
  // if v1 - call process report, then handle mints, then calc APR
  // if v2 (PostTotalShares) - call process report, then handle mints, skip calc APR in favor PostTotalShares
  // if v3 (TransferShares, ELRewardsReceived) - just make totals updates ( process report in ELRewardsReceived and  handle mints), skip calc APR in favor PostTotalShares
  // if v4 (Lido v2) -  skip, process report and mints in ETHDistributed, skip calc APR in favor PostTotalShares,finish process in ExtraDataSubmitted

  let stats = _loadOrCreateStatsEntity()
  let previousCompleted = OracleCompleted.load(stats.lastOracleCompletedId.toString())
  stats.lastOracleCompletedId = stats.lastOracleCompletedId.plus(ONE)

  let newCompleted = new OracleCompleted(stats.lastOracleCompletedId.toString())
  newCompleted.epochId = event.params.epochId
  newCompleted.beaconBalance = event.params.beaconBalance
  newCompleted.beaconValidators = event.params.beaconValidators
  newCompleted.block = event.block.number
  newCompleted.blockTime = event.block.timestamp
  newCompleted.transactionHash = event.transaction.hash
  newCompleted.save()
  stats.save()

  // Totals are already non-null on first oracle report
  const totals = _loadOrCreateTotalsEntity()

  // Create an empty TotalReward entity that will be filled on Transfer events
  // We know that in this transaction there will be Transfer events which we can identify by existence of TotalReward entity with transaction hash as its id
  const totalRewardsEntity = _loadOrCreateTotalRewardEntity(event)

  // save prev values
  totalRewardsEntity.totalPooledEtherBefore = totals.totalPooledEther
  totalRewardsEntity.totalSharesBefore = totals.totalShares

  // calc reward
  let oldBeaconValidators = previousCompleted ? previousCompleted.beaconValidators : ZERO
  let oldBeaconBalance = previousCompleted ? previousCompleted.beaconBalance : ZERO
  let newBeaconValidators = event.params.beaconValidators
  let newBeaconBalance = event.params.beaconBalance
  let appearedValidators = newBeaconValidators.minus(oldBeaconValidators)

  /**
   Appeared validators can be negative if active keys are deleted, which can happen on Testnet.
   As we are comparing previous Oracle report, by the time of a new report validator removal can happen.

   In such cases, we override appearedValidatorsDeposits to ZERO as:
   Our Subgraph 10 - 20 = -10 validatorsAmount math is 10 - 10 = 0 validatorsAmount in contract.

   Context:

   totalPooledEther = bufferedBalance (in the contract) + beaconBalance (validator balances) + transientBalance (sent to validators, but not yet there)

   transientBalance is tricky, it's (depositedValidators - beaconValidators) * 32eth

   DEPOSITED_VALIDATORS_POSITION is incremented on ETH deposit to deposit contract
   BEACON_VALIDATORS_POSITION is incremented on oracle reports

   As we saw on testnet, manual active key removal will adjust totalPooledEther straight away as there will be a difference between validators deposited and beacon validators.

   DEPOSITED_VALIDATORS_POSITION was left intact
   BEACON_VALIDATORS_POSITION was decreased

   This would increase totalPooledEther until an oracle report is made.
  **/

  let appearedValidatorsDeposits = appearedValidators.gt(ZERO) ? appearedValidators.times(DEPOSIT_AMOUNT) : ZERO
  let rewardBase = appearedValidatorsDeposits.plus(oldBeaconBalance)
  let rewards = newBeaconBalance.minus(rewardBase)

  // we should process token rebase here as TokenRebased event fired last but we need new values before transfers
  // parse all events from tx receipt
  const parsedEvents = parseEventLogs(event)
  const elRewardsReceivedEvent = _findELRewardsReceivedEvent(parsedEvents)
  const mevTxFeeReceivedEvent = _findMevTxFeeReceivedEvent(parsedEvents)

  totalRewardsEntity.mevFee = elRewardsReceivedEvent
    ? elRewardsReceivedEvent.params.amount
    : mevTxFeeReceivedEvent
    ? mevTxFeeReceivedEvent.params.amount
    : ZERO
  rewards = rewards.plus(totalRewardsEntity.mevFee)

  // Increasing or decreasing totals
  totals.totalPooledEther = totals.totalPooledEther.plus(rewards)
  totalRewardsEntity.totalPooledEtherAfter = totals.totalPooledEther

  // Don’t mint/distribute any protocol fee on the non-profitable Lido oracle report
  // (when beacon chain balance delta is zero or negative).
  // See ADR #3 for details: https://research.lido.fi/t/rewards-distribution-after-the-merge-architecture-decision-record/1535
  if (newBeaconBalance.le(rewardBase)) {
    totals.save()
    totalRewardsEntity.totalSharesAfter = totals.totalShares
    totalRewardsEntity.save()
    return
  }

  totalRewardsEntity.totalRewardsWithFees = rewards
  // Setting totalRewards to totalRewardsWithFees so we can subtract fees from it
  totalRewardsEntity.totalRewards = rewards

  let currentFees = CurrentFees.load('')!

  // Total fee of the protocol eg 1000 / 100 = 10% fee
  let feeBasis = currentFees.feeBasisPoints! // 1000

  // Overall shares for all rewards cut
  let shares2mint = rewards
    .times(feeBasis)
    .times(totals.totalShares)
    .div(totals.totalPooledEther.times(CALCULATION_UNIT).minus(feeBasis.times(rewards)))

  totals.totalShares = totals.totalShares.plus(shares2mint)
  totals.save()

  totalRewardsEntity.totalSharesAfter = totals.totalShares

  // Further shares calculations
  // There are currently 3 possible fees

  // Storing contract calls data so we don't need to fetch it again
  // We will load them in handleMevTxFeeReceived in Lido handlers
  totalRewardsEntity.feeBasis = feeBasis
  totalRewardsEntity.treasuryFeeBasisPoints = currentFees.treasuryFeeBasisPoints! // 0
  totalRewardsEntity.insuranceFeeBasisPoints = currentFees.insuranceFeeBasisPoints! // 5000
  totalRewardsEntity.operatorsFeeBasisPoints = currentFees.operatorsFeeBasisPoints! // 5000

  const sharesToInsuranceFund = shares2mint.times(totalRewardsEntity.insuranceFeeBasisPoints).div(CALCULATION_UNIT)
  const sharesToOperators = shares2mint.times(totalRewardsEntity.operatorsFeeBasisPoints).div(CALCULATION_UNIT)

  totalRewardsEntity.shares2mint = shares2mint
  totalRewardsEntity.sharesToInsuranceFund = sharesToInsuranceFund
  totalRewardsEntity.sharesToOperators = sharesToOperators

  // We will save the entity later

  const registry = NodeOperatorsRegistry.bind(getAddress('NO_REGISTRY'))
  const distr = registry.getRewardsDistribution(sharesToOperators)

  const opAddresses = distr.value0
  const opShares = distr.value1

  let sharesToOperatorsActual = ZERO

  for (let i = 0; i < opAddresses.length; i++) {
    const addr = opAddresses[i]
    const shares = opShares[i]

    // Incrementing total of actual shares distributed
    sharesToOperatorsActual = sharesToOperatorsActual.plus(shares)

    const nodeOperatorsShares = new NodeOperatorsShares(event.transaction.hash.toHex() + '-' + addr.toHexString())
    nodeOperatorsShares.totalReward = event.transaction.hash

    nodeOperatorsShares.address = addr
    nodeOperatorsShares.shares = shares

    nodeOperatorsShares.save()
  }

  // sharesToTreasury either:w11
  // - contain dust already and dustSharesToTreasury is 0
  // or
  // - 0 and there's dust

  let treasuryShares = shares2mint.minus(sharesToInsuranceFund).minus(sharesToOperatorsActual)

  if (totalRewardsEntity.treasuryFeeBasisPoints.isZero()) {
    totalRewardsEntity.sharesToTreasury = ZERO
    totalRewardsEntity.dustSharesToTreasury = treasuryShares
  } else {
    totalRewardsEntity.sharesToTreasury = treasuryShares
    totalRewardsEntity.dustSharesToTreasury = ZERO
  }

  // find PostTotalShares logIndex
  // if event absent, we should calc values
  const postTotalSharesEvent = _findPostTotalSharesEvent(parsedEvents)
  if (postTotalSharesEvent) {
    totalRewardsEntity.timeElapsed = postTotalSharesEvent.params.timeElapsed
    _calcAPR_v1(
      totalRewardsEntity,
      postTotalSharesEvent.params.preTotalPooledEther,
      postTotalSharesEvent.params.postTotalPooledEther,
      postTotalSharesEvent.params.timeElapsed,
      feeBasis
    )
  } else {
    const timeElapsed = previousCompleted ? newCompleted.blockTime.minus(previousCompleted.blockTime) : ZERO
    totalRewardsEntity.timeElapsed = timeElapsed
    _calcAPR_v1(
      totalRewardsEntity,
      totalRewardsEntity.totalPooledEtherBefore,
      totalRewardsEntity.totalPooledEtherAfter,
      timeElapsed,
      feeBasis
    )
  }
  totalRewardsEntity.save()
}
