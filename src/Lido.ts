import {
  Stopped,
  Resumed,
  Transfer,
  Approval,
  FeeSet,
  FeeDistributionSet,
  WithdrawalCredentialsSet,
  Submitted,
  Unbuffered,
  Withdrawal,
} from "../generated/Lido/Lido";
import {
  LidoStopped,
  LidoResumed,
  LidoTransfer,
  LidoApproval,
  LidoFee,
  LidoFeeDistribution,
  LidoWithdrawalCredential,
  LidoSubmission,
  LidoUnbuffered,
  LidoWithdrawal,
} from "../generated/schema";

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

export function handleTransfer(event: Transfer): void {
  let entity = new LidoTransfer(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.from = event.params.from;
  entity.to = event.params.to;
  entity.value = event.params.value;
  /*
  entity.shares = event.params.value/current_ratio
  */
  
  /*
  if (isFeeDistributionToTreasury(event)) {
    totalRewards = (event.params.value / (getCurrentTreasuryFee))*(1 - getCurrentTotalFees)
    totalRewards.save()
  }
  */

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

export function handleWithdrawalCredentialsSet(
  event: WithdrawalCredentialsSet
): void {
  let entity = new LidoWithdrawalCredential(
    event.params.withdrawalCredentials.toHex()
  );

  entity.withdrawalCredentials = event.params.withdrawalCredentials;

  entity.save();
}

export function handleSubmit(event: Submitted): void {
  let entity = new LidoSubmission(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.sender = event.params.sender;
  entity.amount = event.params.amount;
  entity.referral = event.params.referral;

  entity.save();
}

export function handleUnbuffered(event: Unbuffered): void {
  let entity = new LidoUnbuffered(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.amount = event.params.amount;

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
