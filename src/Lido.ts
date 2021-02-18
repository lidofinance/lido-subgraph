import {
  FeeSet,
  FeeDistributionSet,
  Submitted,
  Withdrawal,
  Unbuffered,
  Transfer,
  Approval,
  Stopped,
  Resumed,
} from "../generated/Lido/Lido";
import {
  LidoSubmission,
  LidoFee,
  LidoFeeDistribution,
  LidoWithdrawal,
  LidoUnbuffered,
  LidoTransfer,
  LidoApproval,
  LidoStopped,
  LidoResumed,
} from "../generated/schema";

export function handleSubmit(event: Submitted): void {
  let entity = new LidoSubmission(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.sender = event.params.sender;
  entity.amount = event.params.amount;
  entity.referral = event.params.referral;

  entity.save();
}

export function handleFeeSet(event: FeeSet): void {
  let entity = new LidoFee(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.feeBasisPoints = event.params.feeBasisPoints;

  entity.save();
}

export function handleFeeDistributionSet(event: FeeDistributionSet): void {
  let entity = new LidoFeeDistribution(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.treasuryFeeBasisPoints = event.params.treasuryFeeBasisPoints;
  entity.insuranceFeeBasisPoints = event.params.insuranceFeeBasisPoints;
  entity.operatorsFeeBasisPoints = event.params.operatorsFeeBasisPoints;

  entity.save();
}

export function handleWithdrawal(event: Withdrawal): void {
  let entity = new LidoWithdrawal(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.sender = event.params.sender;
  entity.tokenAmount = event.params.tokenAmount;
  entity.sentFromBuffer = event.params.sentFromBuffer;
  entity.pubkeyHash = event.params.pubkeyHash;
  entity.etherAmount = event.params.etherAmount;

  entity.save();
}

export function handleUnbuffered(event: Unbuffered): void {
  let entity = new LidoUnbuffered(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.amount = event.params.amount;

  entity.save();
}

export function handleTransfer(event: Transfer): void {
  let entity = new LidoTransfer(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.from = event.params.from;
  entity.to = event.params.to;
  entity.value = event.params.value;

  entity.save();
}

export function handleApproval(event: Approval): void {
  let entity = new LidoApproval(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.owner = event.params.owner;
  entity.spender = event.params.spender;
  entity.value = event.params.value;

  entity.save();
}

export function handleStopped(event: Stopped): void {
  let entity = new LidoStopped(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.blocktime = event.block.timestamp;

  entity.save();
}

export function handleResumed(event: Resumed): void {
  let entity = new LidoResumed(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.blocktime = event.block.timestamp;

  entity.save();
}
