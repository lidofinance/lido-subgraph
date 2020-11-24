import { FeeSet, FeeDistributionSet, Submitted } from "../generated/Lido/Lido";
import {
  LidoSubmission,
  LidoFee,
  LidoFeeDistribution,
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
