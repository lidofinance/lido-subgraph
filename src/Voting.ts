import {
  StartVote,
  CastVote,
  ExecuteVote,
  ChangeSupportRequired,
  ChangeMinQuorum,
} from "../generated/Voting/Voting";
import {
  Voting,
  Vote,
  ChangedSupportRequired,
  ChangedMinQuorum,
} from "../generated/schema";

export function handleStartVote(event: StartVote): void {
  let entity = new Voting(event.params.voteId.toHex());

  entity.index = event.params.voteId.toI32();
  entity.creator = event.params.creator;
  entity.metadata = event.params.metadata;
  entity.executed = false;

  entity.save();
}

export function handleCastVote(event: CastVote): void {
  let entity = new Vote(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.voting = event.params.voteId.toHex();
  entity.voter = event.params.voter;
  entity.supports = event.params.supports;
  entity.stake = event.params.stake;

  entity.save();
}

export function handleExecuteVote(event: ExecuteVote): void {
  let entity = Voting.load(event.params.voteId.toHex());

  if (entity == null) {
    entity = new Voting(event.params.voteId.toHex());
  }

  entity.executed = true;

  entity.save();
}

// Global settings

export function handleChangeSupportRequired(
  event: ChangeSupportRequired
): void {
  let entity = new ChangedSupportRequired(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.supportRequiredPct = event.params.supportRequiredPct;

  entity.save();
}

export function handleChangeMinQuorum(event: ChangeMinQuorum): void {
  let entity = new ChangedMinQuorum(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.minAcceptQuorumPct = event.params.minAcceptQuorumPct;

  entity.save();
}
