import {
  AllowedBeaconBalanceAnnualRelativeIncreaseSet as AllowedBeaconBalanceAnnualRelativeIncreaseSetEvent,
  AllowedBeaconBalanceRelativeDecreaseSet as AllowedBeaconBalanceRelativeDecreaseSetEvent,
  BeaconReportReceiverSet as BeaconReportReceiverSetEvent,
  // BeaconReported,
  BeaconSpecSet as BeaconSpecSetEvent,
  Completed as CompletedEvent,
  ContractVersionSet as ContractVersionSetEvent,
  MemberAdded as MemberAddedEvent,
  MemberRemoved as MemberRemovedEvent,
  PostTotalShares as PostTotalSharesEvent,
  QuorumChanged as QuorumChangedEvent
} from '../generated/LegacyOracle/LegacyOracle'
import { NodeOperatorsRegistry } from '../generated/LegacyOracle/NodeOperatorsRegistry'
import {
  BeaconReport,
  CurrentFee,
  NodeOperatorsShares,
  OracleCompleted,
  OracleConfig,
  OracleExpectedEpoch,
  OracleMember
} from '../generated/schema'
import { CALCULATION_UNIT, DEPOSIT_AMOUNT, ONE, ZERO, ZERO_ADDRESS, getAddress } from './constants'

import {
  _calcAPR_v1,
  _loadStatsEntity,
  _loadTotalRewardEntity,
  _loadTotalsEntity,
  isLidoV2
} from './helpers'
import { ELRewardsReceived, MevTxFeeReceived } from '../generated/Lido/Lido'
import { getParsedEventByName, parseEventLogs } from './parser'
import { ethereum } from '@graphprotocol/graph-ts'

export function handleCompleted(event: CompletedEvent): void {
  // keep backward compatibility
  const stats = _loadStatsEntity()
  const previousCompleted = OracleCompleted.load(stats.lastOracleCompletedId.toString())
  stats.lastOracleCompletedId = stats.lastOracleCompletedId.plus(ONE)

  const newCompleted = new OracleCompleted(stats.lastOracleCompletedId.toString())
  newCompleted.epochId = event.params.epochId
  newCompleted.beaconBalance = event.params.beaconBalance
  newCompleted.beaconValidators = event.params.beaconValidators

  newCompleted.block = event.block.number
  newCompleted.blockTime = event.block.timestamp
  newCompleted.transactionHash = event.transaction.hash
  newCompleted.logIndex = event.logIndex
  newCompleted.save()
  stats.save()

  const config = _loadOracleConfig()

  const beaconReportEntity = new BeaconReport(event.transaction.hash.concatI32(event.logIndex.toI32()))
  beaconReportEntity.epochId = event.params.epochId
  beaconReportEntity.beaconBalance = event.params.beaconBalance
  beaconReportEntity.beaconValidators = event.params.beaconValidators
  beaconReportEntity.caller = event.transaction.from
  beaconReportEntity.save()

  const expectedEpochEntity = new OracleExpectedEpoch(event.transaction.hash.concatI32(event.logIndex.toI32()))
  expectedEpochEntity.epochId = event.params.epochId.plus(config.epochsPerFrame)
  expectedEpochEntity.save()

  if (isLidoV2()) {
    // skip in favor of ETHDistributed event handler
    return
  }

  // Totals should be already non-null on first oracle report
  const totals = _loadTotalsEntity()!

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

  const oldBeaconValidators = previousCompleted ? previousCompleted.beaconValidators : ZERO
  const oldBeaconBalance = previousCompleted ? previousCompleted.beaconBalance : ZERO
  const newBeaconValidators = event.params.beaconValidators
  const newBeaconBalance = event.params.beaconBalance

  const appearedValidators = newBeaconValidators.minus(oldBeaconValidators)
  const appearedValidatorsDeposits = appearedValidators > ZERO ? appearedValidators.times(DEPOSIT_AMOUNT) : ZERO
  const rewardBase = appearedValidatorsDeposits.plus(oldBeaconBalance)

  // try to find MEV rewards, parse all events from tx receipt
  const parsedEvents = parseEventLogs(event)
  const elRewardsEvent = getParsedEventByName<ELRewardsReceived>(parsedEvents, 'ELRewardsReceived', event.logIndex)
  const mevTxFeeEvent = getParsedEventByName<MevTxFeeReceived>(parsedEvents, 'MevTxFeeReceived', event.logIndex)
  const mevFee = elRewardsEvent ? elRewardsEvent.params.amount : mevTxFeeEvent ? mevTxFeeEvent.params.amount : ZERO

  const rewards = newBeaconBalance.minus(rewardBase).plus(mevFee)

  // Keeping data before increase
  const totalPooledEtherBefore = totals.totalPooledEther
  const totalSharesBefore = totals.totalShares

  // totalPooledEtherAfter
  totals.totalPooledEther = totals.totalPooledEther.plus(rewards)

  // Don’t mint/distribute any protocol fee on the non-profitable Lido oracle report
  // (when beacon chain balance delta is zero or negative).
  // See ADR #3 for details: https://research.lido.fi/t/rewards-distribution-after-the-merge-architecture-decision-record/1535
  if (newBeaconBalance <= rewardBase) {
    totals.save()
    return
  }

  // Create an empty TotalReward entity that will be filled on Transfer events
  // We know that in this transaction there will be Transfer events which we can identify by existence of TotalReward entity with transaction hash as its id
  const totalRewardsEntity = _loadTotalRewardEntity(event, true)!

  // save prev values
  totalRewardsEntity.totalPooledEtherBefore = totalPooledEtherBefore
  totalRewardsEntity.totalSharesBefore = totalSharesBefore
  totalRewardsEntity.totalPooledEtherAfter = totals.totalPooledEther

  totalRewardsEntity.mevFee = mevFee

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

  // calc preliminarily APR
  // will be recalculated in PostTotalShares handler
  const timeElapsed = previousCompleted ? newCompleted.blockTime.minus(previousCompleted.blockTime) : ZERO
  totalRewardsEntity.timeElapsed = timeElapsed
  _calcAPR_v1(
    totalRewardsEntity,
    totalRewardsEntity.totalPooledEtherBefore,
    totalRewardsEntity.totalPooledEtherAfter,
    timeElapsed,
    totalRewardsEntity.feeBasis
  )

  // // find PostTotalShares logIndex
  // // if event absent, we should calc values
  // const postTotalSharesEvent = getParsedEventByName<PostTotalSharesEvent>(
  //   parsedEvents,
  //   'PostTotalShares',
  //   event.logIndex
  // )
  // // todo assert require if upgraded to PostTotalShares
  // if (postTotalSharesEvent) {
  //   totalRewardsEntity.timeElapsed = postTotalSharesEvent.params.timeElapsed
  //   _calcAPR_v1(
  //     totalRewardsEntity,
  //     postTotalSharesEvent.params.preTotalPooledEther,
  //     postTotalSharesEvent.params.postTotalPooledEther,
  //     postTotalSharesEvent.params.timeElapsed,
  //     curFee.feeBasisPoints
  //   )
  // } else {
  //   const timeElapsed = previousCompleted ? newCompleted.blockTime.minus(previousCompleted.blockTime) : ZERO
  //   totalRewardsEntity.timeElapsed = timeElapsed
  //   _calcAPR_v1(
  //     totalRewardsEntity,
  //     totalRewardsEntity.totalPooledEtherBefore,
  //     totalRewardsEntity.totalPooledEtherAfter,
  //     timeElapsed,
  //     curFee.feeBasisPoints
  //   )
  // }
  totalRewardsEntity.save()
}

export function handlePostTotalShares(event: PostTotalSharesEvent): void {
  if (isLidoV2()) {
    // skip in favor of TokenRebased event handler
    return
  }

  const totalRewardsEntity = _loadTotalRewardEntity(event)
  if (!totalRewardsEntity) {
    return
  }

  totalRewardsEntity.timeElapsed = event.params.timeElapsed
  _calcAPR_v1(
    totalRewardsEntity,
    event.params.preTotalPooledEther,
    event.params.postTotalPooledEther,
    event.params.timeElapsed,
    totalRewardsEntity.feeBasis
  )
  totalRewardsEntity.save()
}

// export function handleBeaconReported(event: BeaconReported): void {
//   const entity = new BeaconReport(event.transaction.hash.concatI32(event.logIndex.toI32()))
//   entity.epochId = event.params.epochId
//   entity.beaconBalance = event.params.beaconBalance
//   entity.beaconValidators = event.params.beaconValidators
//   entity.caller = event.params.caller
//   entity.save()
// }

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

export function _loadOracleConfig(): OracleConfig {
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

export function _saveOracleConfig(entity: OracleConfig, event: ethereum.Event): void {
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex
  entity.save()
}
