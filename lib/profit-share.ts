import type { Thesis } from "./data";
export const CREATOR_PROFIT_SHARE_BPS = 50;
export type SharePosition = {
  amount: number;
  invested: number;
  shareEligible?: boolean;
  shareRealized?: number;
  shareHighWater?: number;
  sharePaid?: number;
};
export type Follow = { thesisId: string; active: boolean; acceptedAt: number };
export function hasCreatorShare(
  thesis: Pick<Thesis, "owner" | "example">,
  userId: string | undefined,
) {
  return !!thesis.owner && !thesis.example && thesis.owner !== userId;
}
// Amounts and cumulative realized profit are integer cents. Fractional fee cents
// carry forward through the cumulative high-water mark, even across re-entry.
export function settleProfitShare(
  position: SharePosition,
  proceeds: number,
  closeAll = false,
  tradingFee = 0,
  basisPoints = CREATOR_PROFIT_SHARE_BPS,
  releasedCost?: number,
) {
  if (
    !Number.isSafeInteger(position.amount) ||
    position.amount <= 0 ||
    !Number.isSafeInteger(proceeds) ||
    proceeds < 0 ||
    !Number.isSafeInteger(tradingFee) ||
    tradingFee < 0 ||
    tradingFee > proceeds ||
    (!closeAll && proceeds > position.amount) ||
    !Number.isSafeInteger(basisPoints) || basisPoints<0 || basisPoints>10000
  )
    throw new Error("Invalid sale amount.");
  const remainingAmount = closeAll ? 0 : position.amount - proceeds;
  if(releasedCost!==undefined&&(!Number.isSafeInteger(releasedCost)||releasedCost<0||releasedCost>position.invested))throw new Error('Invalid released cost.');
  const remainingCost = releasedCost!==undefined ? position.invested-releasedCost : closeAll
    ? 0
    : Math.round((position.invested * remainingAmount) / position.amount);
  const realizedProfit =
    proceeds - tradingFee - (position.invested - remainingCost);
  let shareRealized = position.shareRealized || 0,
    shareHighWater = position.shareHighWater || 0,
    sharePaid = position.sharePaid || 0,
    fee = 0;
  if (position.shareEligible) {
    shareRealized += realizedProfit;
    shareHighWater = Math.max(shareHighWater, shareRealized, 0);
    const totalDue = Number(BigInt(shareHighWater)*BigInt(basisPoints)/10000n);
    fee = Math.max(0, totalDue - sharePaid);
    sharePaid += fee;
  }
  return {
    remainingAmount,
    remainingCost,
    realizedProfit,
    shareRealized,
    shareHighWater,
    sharePaid,
    fee,
    netProceeds: proceeds - tradingFee - fee,
  };
}
