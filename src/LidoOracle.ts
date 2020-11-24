import {
  MemberAdded,
  MemberRemoved,
  QuorumChanged,
  Completed,
} from "../generated/LidoOracle/LidoOracle";
import {
  OracleCompleted,
  OracleMember,
  OracleQuorumChange,
} from "../generated/schema";

export function handleCompleted(event: Completed): void {
  let entity = new OracleCompleted(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.epochId = event.params.epochId;
  entity.beaconBalance = event.params.beaconBalance;
  entity.beaconValidators = event.params.beaconValidators;

  entity.save();
}

export function handleMemberAdded(event: MemberAdded): void {
  let entity = new OracleMember(event.params.member.toHex());

  entity.member = event.params.member;
  entity.removed = false;

  entity.save();
}

export function handleMemberRemoved(event: MemberRemoved): void {
  let entity = OracleMember.load(event.params.member.toHex());

  if (entity == null) {
    entity = new OracleMember(event.params.member.toHex());
  }

  entity.removed = true;

  entity.save();
}

export function handleQuorumChanged(event: QuorumChanged): void {
  let entity = new OracleQuorumChange(event.params.quorum.toHex());

  entity.quorum = event.params.quorum;

  entity.save();
}
