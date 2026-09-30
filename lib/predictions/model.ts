import type { Thesis } from "../data";
import { chartCoinId } from "../coin-chart";
import {externalStrategy} from '../external-strategy';

export const PERIODS = [1, 30, 90] as const;
export type Period = (typeof PERIODS)[number];
export type Side = "right" | "wrong";
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const REFUND_DELAY = 7 * DAY;
export type BasketToken = { symbol: string; coinId: string; weight: number };
export type Round = {
  id: string;
  thesisId: string;
  days: Period;
  sequence: number;
  thesisVersion: number;
  title: string;
  basket: BasketToken[];
  startsAt: number;
  endsAt: number;
  status: "open" | "settled";
  outcome: Side | "refund" | null;
  returnPct: number | null;
  reason: string | null;
  right: number;
  wrong: number;
  bettors: number;
};
export type Bet = {
  id: string;
  roundId: string;
  thesisId: string;
  days: Period;
  side: Side;
  amount: number;
  stake: number;
  fee: number;
  payout: number | null;
  createdAt: number;
  startsAt: number;
  endsAt: number;
  outcome: Round["outcome"];
};
export type PredictionData = {
  rounds: Round[];
  bets: Bet[];
  balance: number | null;
  signedIn: boolean;
  checkedAt: number;
};
export class PredictionError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function freezeBasket(thesis: Thesis): BasketToken[] {
  if(externalStrategy(thesis))throw new PredictionError('Basket-return pools are unavailable for counter strategies, short baskets and external outcome shares. Counter bets use the original pool; external shares use the linked event rules.',409);
  const basket = thesis.allocations
    .filter((a) => a.weight > 0)
    .map((a) => {
      const coinId = chartCoinId(thesis, a.symbol);
      if (!coinId)
        throw new PredictionError(
          `Verified price history is needed for ${a.symbol} before opening a round.`,
          409,
        );
      return { ...a, coinId };
    });
  if (
    !basket.length ||
    basket.length > 10 ||
    basket.some((a) => !Number.isInteger(a.weight) || a.weight < 1) ||
    basket.reduce((s, a) => s + a.weight, 0) !== 100 ||
    new Set(basket.map((a) => a.coinId)).size !== basket.length
  )
    throw new PredictionError(
      "This basket needs valid, unique allocations totaling 100%.",
      409,
    );
  return basket;
}
export function roundTimes(days: Period, now: number) {
  // All bets close before the return measurement starts. No betting on a known outcome.
  const startsAt = (Math.ceil(now / HOUR) + 1) * HOUR;
  return { startsAt, endsAt: startsAt + days * DAY };
}
export function weightedReturn(
  basket: BasketToken[],
  prices: Record<string, { start: number; end: number }>,
) {
  let ratio = 0;
  for (const token of basket) {
    const p = prices[token.coinId];
    if (
      !p ||
      !Number.isFinite(p.start) ||
      !Number.isFinite(p.end) ||
      p.start <= 0 ||
      p.end <= 0
    )
      throw new PredictionError(
        "Complete boundary prices are not available yet.",
        503,
      );
    ratio += (token.weight / 100) * (p.end / p.start);
  }
  // Deterministic resolution to 0.000001 percentage points, shown in the rules.
  const pct = Math.round((ratio - 1) * 100 * 1e6) / 1e6;
  return Object.is(pct, -0) ? 0 : pct;
}
export type PayoutBet = {
  id: string;
  userId: string;
  side: Side;
  stake: number;
  amount: number;
};
export function poolPayouts(bets: PayoutBet[], outcome: Side | "refund") {
  if (
    bets.some(
      (b) =>
        !Number.isSafeInteger(b.stake) ||
        b.stake <= 0 ||
        !Number.isSafeInteger(b.amount) ||
        b.amount < b.stake,
    )
  )
    throw new PredictionError("Invalid pool amounts.");
  const right = bets
    .filter((b) => b.side === "right")
    .reduce((s, b) => s + BigInt(b.stake), 0n);
  const wrong = bets
    .filter((b) => b.side === "wrong")
    .reduce((s, b) => s + BigInt(b.stake), 0n);
  if (outcome === "refund" || right === 0n || wrong === 0n)
    return bets.map((b) => ({ ...b, payout: b.amount }));
  const total = right + wrong,
    winning = outcome === "right" ? right : wrong;
  const rows = bets.map((b) => ({
    ...b,
    payout:
      b.side === outcome ? Number((BigInt(b.stake) * total) / winning) : 0,
    remainder: b.side === outcome ? (BigInt(b.stake) * total) % winning : 0n,
  }));
  let leftover = Number(total) - rows.reduce((s, b) => s + b.payout, 0);
  const winners = rows
    .filter((b) => b.side === outcome)
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  for (const b of winners) if (leftover-- > 0) b.payout++;
  return rows.map((b) => ({
    id: b.id,
    userId: b.userId,
    side: b.side,
    stake: b.stake,
    amount: b.amount,
    payout: b.payout,
  }));
}
export const predictionFlow = (side: string, amount: number): number | null =>
  side === "prediction-stake"
    ? -amount
    : side === "prediction-payout" || side === "prediction-refund"
      ? amount
      : null;
