import {
  AllowedBeaconBalanceAnnualRelativeIncreaseSet as AllowedBeaconBalanceAnnualRelativeIncreaseSetEvent,
  AllowedBeaconBalanceRelativeDecreaseSet as AllowedBeaconBalanceRelativeDecreaseSetEvent,
  BeaconReportReceiverSet as BeaconReportReceiverSetEvent,
  BeaconSpecSet as BeaconSpecSetEvent,
  Completed as CompletedEvent,
  ContractVersionSet as ContractVersionSetEvent,
  MemberAdded as MemberAddedEvent,
  MemberRemoved as MemberRemovedEvent,
  PostTotalShares as PostTotalSharesEvent,
  QuorumChanged as QuorumChangedEvent
} from '../generated/LegacyOracle/LegacyOracle'
import { NodeOperatorsRegistry } from '../generated/LegacyOracle/NodeOperatorsRegistry'
import { CurrentFee, NodeOperatorsShares, OracleCompleted, OracleConfig, OracleMember } from '../generated/schema'
import { CALCULATION_UNIT, DEPOSIT_AMOUNT, ONE, ZERO, ZERO_ADDRESS, getAddress } from './constants'

import {
  _calcAPR_v1,
  _loadOrCreateStatsEntity,
  _loadOrCreateTotalRewardEntity,
  _loadOrCreateTotalsEntity,
  _updateHolders,
  _updateTransferShares,
  isOracleV2
} from './helpers'
import { ELRewardsReceived, MevTxFeeReceived, TokenRebased } from '../generated/Lido/Lido'
import { getParsedEventByName, parseEventLogs } from './parser'
import { ethereum } from '@graphprotocol/graph-ts'

export function handleCompleted(event: CompletedEvent): void {
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
  newCompleted.logIndex = event.logIndex
  newCompleted.save()
  stats.save()

  if (isOracleV2()) {
    // skip future totalRewards processing
    return
  }

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
  const elRewardsReceivedEvent = getParsedEventByName<ELRewardsReceived>(
    parsedEvents,
    'ELRewardsReceived',
    event.logIndex
  )
  const mevTxFeeReceivedEvent = getParsedEventByName<MevTxFeeReceived>(parsedEvents, 'MevTxFeeReceived', event.logIndex)

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

  const curFee = CurrentFee.load('')!
  // Total fee of the protocol eg 1000 / 100 = 10% fee
  // feeBasisPoints = 1000

  // Overall shares for all rewards cut
  const shares2mint = rewards
    .times(curFee.feeBasisPoints)
    .times(totals.totalShares)
    .div(totals.totalPooledEther.times(CALCULATION_UNIT).minus(curFee.feeBasisPoints.times(rewards)))

  totals.totalShares = totals.totalShares.plus(shares2mint)
  totals.save()

  totalRewardsEntity.totalSharesAfter = totals.totalShares

  // Further shares calculations
  // There are currently 3 possible fees

  // Storing contract calls data so we don't need to fetch it again
  // We will load them in handleMevTxFeeReceived in Lido handlers
  totalRewardsEntity.feeBasis = curFee.feeBasisPoints
  totalRewardsEntity.treasuryFeeBasisPoints = curFee.treasuryFeeBasisPoints // 0
  totalRewardsEntity.insuranceFeeBasisPoints = curFee.insuranceFeeBasisPoints // 5000
  totalRewardsEntity.operatorsFeeBasisPoints = curFee.operatorsFeeBasisPoints // 5000

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

    const nodeOperatorsShares = new NodeOperatorsShares(event.transaction.hash.concat(addr))
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
  const postTotalSharesEvent = getParsedEventByName<PostTotalSharesEvent>(
    parsedEvents,
    'PostTotalShares',
    event.logIndex
  )
  // todo assert require if upgraded to PostTotalShares
  if (postTotalSharesEvent) {
    totalRewardsEntity.timeElapsed = postTotalSharesEvent.params.timeElapsed
    _calcAPR_v1(
      totalRewardsEntity,
      postTotalSharesEvent.params.preTotalPooledEther,
      postTotalSharesEvent.params.postTotalPooledEther,
      postTotalSharesEvent.params.timeElapsed,
      curFee.feeBasisPoints
    )
  } else {
    const timeElapsed = previousCompleted ? newCompleted.blockTime.minus(previousCompleted.blockTime) : ZERO
    totalRewardsEntity.timeElapsed = timeElapsed
    _calcAPR_v1(
      totalRewardsEntity,
      totalRewardsEntity.totalPooledEtherBefore,
      totalRewardsEntity.totalPooledEtherAfter,
      timeElapsed,
      curFee.feeBasisPoints
    )
  }
  totalRewardsEntity.save()
}

export function handleMemberAdded(event: MemberAddedEvent): void {
  let entity = new OracleMember(event.params.member)
  entity.member = event.params.member
  entity.removed = false
  entity.save()
}

export function handleMemberRemoved(event: MemberRemovedEvent): void {
  let entity = OracleMember.load(event.params.member)
  if (entity == null) {
    entity = new OracleMember(event.params.member)
  }
  entity.removed = true
  entity.save()
}

export function handleQuorumChanged(event: QuorumChangedEvent): void {
  const entity = _loadOracleConfig()
  entity.quorum = event.params.quorum
  _saveOracleConfig(entity, event)
}

export function handleContractVersionSet(event: ContractVersionSetEvent): void {
  const entity = _loadOracleConfig()
  entity.contractVersion = event.params.version
  _saveOracleConfig(entity, event)
}

export function handleBeaconReportReceiverSet(event: BeaconReportReceiverSetEvent): void {
  const entity = _loadOracleConfig()
  entity.beaconReportReceiver = event.params.callback
  _saveOracleConfig(entity, event)
}

export function handleBeaconSpecSet(event: BeaconSpecSetEvent): void {
  const entity = _loadOracleConfig()
  entity.epochsPerFrame = event.params.epochsPerFrame
  entity.slotsPerEpoch = event.params.slotsPerEpoch
  entity.secondsPerSlot = event.params.secondsPerSlot
  entity.genesisTime = event.params.genesisTime
  _saveOracleConfig(entity, event)
}

export function handleAllowedBeaconBalanceRelativeDecreaseSet(
  event: AllowedBeaconBalanceRelativeDecreaseSetEvent
): void {
  const entity = _loadOracleConfig()
  entity.allowedBeaconBalanceRelativeDecrease = event.params.value
  _saveOracleConfig(entity, event)
}

export function handleAllowedBeaconBalanceAnnualRelativeIncreaseSet(
  event: AllowedBeaconBalanceAnnualRelativeIncreaseSetEvent
): void {
  const entity = _loadOracleConfig()
  entity.allowedBeaconBalanceAnnualRelativeIncrease = event.params.value
  _saveOracleConfig(entity, event)
}

function _loadOracleConfig(): OracleConfig {
  let entity = OracleConfig.load('')
  if (!entity) {
    entity = new OracleConfig('')

    entity.quorum = ZERO
    entity.contractVersion = ZERO

    entity.allowedBeaconBalanceAnnualRelativeIncrease = ZERO
    entity.allowedBeaconBalanceRelativeDecrease = ZERO

    entity.epochsPerFrame = ZERO
    entity.slotsPerEpoch = ZERO
    entity.secondsPerSlot = ZERO
    entity.genesisTime = ZERO

    entity.beaconReportReceiver = ZERO_ADDRESS
  }
  return entity
}

function _saveOracleConfig(entity: OracleConfig, event: ethereum.Event): void {
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex
  entity.save()
}
