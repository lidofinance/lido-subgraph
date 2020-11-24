import { Transfer, Approval } from "../generated/StETH/StETH";
import { StETHTransfer, StETHApproval } from "../generated/schema";

export function handleTransfer(event: Transfer): void {
  let entity = new StETHTransfer(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.from = event.params.from;
  entity.to = event.params.to;
  entity.value = event.params.value;

  entity.save();
}

export function handleApproval(event: Approval): void {
  let entity = new StETHApproval(
    event.transaction.hash.toHex() + "-" + event.logIndex.toString()
  );

  entity.owner = event.params.owner;
  entity.spender = event.params.spender;
  entity.value = event.params.value;

  entity.save();
}
