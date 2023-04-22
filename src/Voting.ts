import { BigInt, Address, ethereum } from '@graphprotocol/graph-ts'
import {
  StartVote as StartVoteEvent,
  CastVote as CastVoteEvent,
  CastObjection as CastObjectionEvent,
  ExecuteVote as ExecuteVoteEvent,
  ChangeSupportRequired as ChangeSupportRequiredEvent,
  ChangeMinQuorum as ChangeMinQuorumEvent,
  ChangeVoteTime as ChangeVoteTimeEvent,
  ChangeObjectionPhaseTime as ChangeObjectionPhaseTimeEvent
} from '../generated/Voting/Voting'
import { Voting, Vote, VotingObjection, VotingConfig } from '../generated/schema'
import { _loadSharesEntity, _loadTotalsEntity } from './helpers'
import { ZERO } from './constants'

export function handleStartVote(event: StartVoteEvent): void {
  let entity = new Voting(event.params.voteId.toString())

  entity.index = event.params.voteId.toI32()
  entity.creator = event.params.creator
  entity.metadata = event.params.metadata
  entity.executed = false

  entity.save()
}

export function handleCastVote(event: CastVoteEvent): void {
  let entity = new Vote(event.transaction.hash.concatI32(event.logIndex.toI32()))

  entity.voting = event.params.voteId.toString()
  entity.voter = event.params.voter
  entity.supports = event.params.supports
  entity.stake = event.params.stake

  entity.save()
}

export function handleCastObjection(event: CastObjectionEvent): void {
  let entity = new VotingObjection(event.transaction.hash.concatI32(event.logIndex.toI32()))

  entity.voting = event.params.voteId.toString()
  entity.voter = event.params.voter
  entity.stake = event.params.stake

  entity.save()
}

export function handleExecuteVote(event: ExecuteVoteEvent): void {
  let entity = Voting.load(event.params.voteId.toString())

  if (entity == null) {
    entity = new Voting(event.params.voteId.toString())
  }

  entity.executed = true

  /**
  Accounting for calling burnShares() on Mainnet as we didn't yet have a proper event.
  This one-off operation allows us not to enable tracing.
   **/
  if (event.transaction.hash.toHexString() == '0x55eb29bda8d96a9a92295c358edbcef087d09f24bd684e6b4e88b166c99ea6a7') {
    let accToBurn = Address.fromString('0x3e40d73eb977dc6a537af587d48316fee66e9c8c')
    let sharesToSubtract = BigInt.fromString('32145684728326685744')

    let shares = _loadSharesEntity(accToBurn)
    shares.shares = shares.shares.minus(sharesToSubtract)
    assert(shares.shares >= ZERO, 'Negative shares.hares!')
    shares.save()

    let totals = _loadTotalsEntity()
    totals.totalShares = totals.totalShares.minus(sharesToSubtract)
    assert(totals.totalShares >= ZERO, 'Negative totals.totalShares!')
    totals.save()
  }

  entity.save()
}

// Global settings

export function handleChangeSupportRequired(event: ChangeSupportRequiredEvent): void {
  const entity = _loadVotingConfig()
  entity.supportRequiredPct = event.params.supportRequiredPct
  _saveVotingConfig(entity, event)
}

export function handleChangeMinQuorum(event: ChangeMinQuorumEvent): void {
  const entity = _loadVotingConfig()
  entity.minAcceptQuorumPct = event.params.minAcceptQuorumPct
  _saveVotingConfig(entity, event)
}

export function handleChangeVoteTime(event: ChangeVoteTimeEvent): void {
  const entity = _loadVotingConfig()
  entity.voteTime = event.params.voteTime
  _saveVotingConfig(entity, event)
}

export function handleChangeObjectionPhaseTime(event: ChangeObjectionPhaseTimeEvent): void {
  const entity = _loadVotingConfig()
  entity.objectionPhaseTime = event.params.objectionPhaseTime
  _saveVotingConfig(entity, event)
}

function _loadVotingConfig(): VotingConfig {
  let entity = VotingConfig.load('')
  if (!entity) {
    entity = new VotingConfig('')

    entity.supportRequiredPct = ZERO
    entity.minAcceptQuorumPct = ZERO
    entity.voteTime = ZERO

    entity.objectionPhaseTime = ZERO
  }
  return entity
}

function _saveVotingConfig(entity: VotingConfig, event: ethereum.Event): void {
  entity.block = event.block.number
  entity.blockTime = event.block.timestamp
  entity.transactionHash = event.transaction.hash
  entity.logIndex = event.logIndex
  entity.save()
}
