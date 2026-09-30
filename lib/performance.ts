import { tradePnl, type TradePnl } from './trade-pnl';
import { predictionFlow } from "./predictions/model";
import type { Position } from "./data";
import type { WalletOrder } from "./wallet/types";
import type { LiveAsset } from "./wallet/networks";

export type PaperOrder = {
  id: string;
  thesisId: string;
  side: string;
  amount: number;
  createdAt: number;
  costBasis?:number|null;
  creatorFee?: number;
  tradingFee?: number;
  platformProfitFee?:number;
  feePolicy?:'legacy'|'v2'|'v3'|'v4';
  executionMode?: "spot" | "perps";
  leverage?: number;
  executionReason?: string | null;
};
export type Point = { time: number; value: number };
export type PerformanceRow = {
  thesisId: string;
  title?: string;
  value: number | null;
  cost: number;
  purchased: number;
  realized: number | null;
  profit: number | null;
  open: boolean;
  symbols: string[];
};
export type Performance = {
  rows: PerformanceRow[];
  points: Point[];
  value: number | null;
  cost: number;
  purchased: number;
  realized: number | null;
  unrealized: number | null;
  profit: number | null;
  trades: number;
};
export type PaperProfile = {
  performance: Performance;
  cash: number;
  equity: number;
  orders: PaperOrder[];
  tradePnl: Record<string,TradePnl>;
  checkedAt: number;
  creatorIncome: number;
  creatorFees: number;
  tradingFees: number;
  platformProfitFees:number;
  predictionLocked: number;
  predictionProfit: number;
  funded: number;
};
const sum = (values: (number | null)[]) =>
  values.some((v) => v === null)
    ? null
    : (values as number[]).reduce((s, v) => s + v, 0);

// Replay the entire ledger in cents, including closed positions. A scenario stores
// the new position value; it is neither a deposit nor a cash-flow delta.
export function paperPerformance(
  orders: PaperOrder[],
  positions: Position[],
  balance: number,
  now: number,
  predictionLockedCents = 0,
): PaperProfile {
  const sorted = [...orders].sort((a, b) => a.createdAt - b.createdAt);
  const book = new Map<
    string,
    { value: number; cost: number; purchased: number; realized: number }
  >();
  let cash = 1_000_000,
    deposits = 0,
    trades = 0,
    creatorIncome = 0,
    creatorFees = 0,
    tradingFees = 0,
    platformProfitFees=0,
    predictionCashFlow = 0;
  const points: Point[] = [
    { time: (sorted[0]?.createdAt ?? now) - 1, value: 10_000 },
  ];
  for (const order of sorted) {
    if (order.side === "demo-fund") {
      cash += order.amount;
      deposits += order.amount;
      continue;
    }
    const bettingFlow = predictionFlow(order.side, order.amount);
    if (bettingFlow !== null) {
      predictionCashFlow += bettingFlow;
      continue;
    }
    if (order.side === "creator-income") {
      cash += order.amount;
      creatorIncome += order.amount;
      points.push({
        time: order.createdAt,
        value:
          (cash +
            [...book.values()].reduce((s, p) => s + p.value, 0) -
            creatorIncome - deposits) /
          100,
      });
      continue;
    }
    const platformFee = order.tradingFee || 0;
    const profitFee=order.platformProfitFee||0;
    const fee = (order.creatorFee || 0) + platformFee+profitFee;
    platformProfitFees+=profitFee;
    creatorFees += order.creatorFee || 0;
    tradingFees += platformFee;
    const entry = book.get(order.thesisId) ?? {
      value: 0,
      cost: 0,
      purchased: 0,
      realized: 0,
    };
    if (order.side === "buy") {
      cash -= order.amount;
      entry.value += order.amount - platformFee;
      entry.cost += order.amount;
      entry.purchased += order.amount;
      trades++;
    } else if (order.side === "sell") {
      const remainingCost = order.costBasis!==null&&order.costBasis!==undefined ? entry.cost-order.costBasis : entry.value
        ? Math.round(entry.cost * ((entry.value - order.amount) / entry.value))
        : 0;
      entry.realized += order.amount - fee - (entry.cost - remainingCost);
      cash += order.amount - fee;
      entry.value -= order.amount;
      entry.cost = remainingCost;
      trades++;
    } else if (order.side === "rule-exit") {
      entry.realized += order.amount - fee - entry.cost;
      cash += order.amount - fee;
      entry.value = 0;
      entry.cost = 0;
      trades++;
    } else if (order.side === "scenario") entry.value = order.amount;
    book.set(order.thesisId, entry);
    points.push({
      time: order.createdAt,
      value:
        (cash +
          [...book.values()].reduce((s, p) => s + p.value, 0) -
          creatorIncome - deposits) /
        100,
    });
  }
  // Use the authoritative current snapshot for current values, not a truncated feed.
  const ids = new Set([...book.keys(), ...positions.map((p) => p.thesisId)]);
  const rows = [...ids].map((thesisId) => {
    const p = positions.find((p) => p.thesisId === thesisId),
      b = book.get(thesisId);
    const value = (p?.amount ?? 0) / 100,
      cost = (p?.invested ?? 0) / 100,
      realized = (b?.realized ?? 0) / 100;
    return {
      thesisId,
      value,
      cost,
      purchased: (b?.purchased ?? 0) / 100,
      realized,
      profit:
        ((b?.realized ?? 0) + (p?.amount ?? 0) - (p?.invested ?? 0)) / 100,
      open: value > 0,
      symbols: [],
    };
  });
  const valueCents = positions.reduce((s, p) => s + p.amount, 0),
    costCents = positions.reduce((s, p) => s + p.invested, 0),
    value = valueCents / 100,
    cost = costCents / 100,
    equity = (balance + valueCents + predictionLockedCents) / 100,
    profitCents =
      balance - predictionCashFlow + valueCents - 1_000_000 - creatorIncome - deposits,
    unrealizedCents = valueCents - costCents;
  points.push({
    time: now,
    value: (balance - predictionCashFlow + valueCents - creatorIncome - deposits) / 100,
  });
  const profit = profitCents / 100,
    unrealized = unrealizedCents / 100;
  return {
    cash: balance / 100,
    equity,
    orders: sorted.reverse(),
    tradePnl: tradePnl(orders,positions),
    checkedAt: now,
    creatorIncome: creatorIncome / 100,
    creatorFees: creatorFees / 100,
    tradingFees: tradingFees / 100,
    platformProfitFees:platformProfitFees/100,
    predictionLocked: predictionLockedCents / 100,
    predictionProfit: (predictionCashFlow + predictionLockedCents) / 100,
    funded: (1_000_000 + deposits) / 100,
    performance: {
      rows,
      points,
      value,
      cost,
      purchased: rows.reduce((s, r) => s + r.purchased, 0),
      realized: (profitCents - unrealizedCents) / 100,
      unrealized,
      profit,
      trades,
    },
  };
}

export const assetKey = (asset: LiveAsset) =>
  `${asset.chainId}:${asset.address.toLowerCase()}`;
type Lot = { asset: LiveAsset; quantity: bigint; cost: number };
type WalletRow = {
  thesisId: string;
  title: string;
  lots: Map<string, Lot>;
  purchased: number;
  realized: number;
  incomplete: boolean;
};
export type Prices = Record<string, number | null>;
const units = (raw: string, decimals: number) => Number(raw) / 10 ** decimals;

// Average cost is kept per thesis and exact chain/contract. Only confirmed fills
// contribute. Funding, untouched USDC reserves and gas estimates are excluded.
export function walletBook(orders: WalletOrder[]) {
  const book = new Map<string, WalletRow>();
  const points: Point[] = [];
  let trades = 0;
  for (const order of [...orders].sort((a, b) => a.createdAt - b.createdAt)) {
    if (order.kind === "fund" || !order.thesisId) continue;
    const confirmed = order.legs.filter((l) => l.status === "confirmed");
    if (!confirmed.length) continue;
    trades++;
    const row = book.get(order.thesisId) ?? {
      thesisId: order.thesisId,
      title: order.title,
      lots: new Map<string, Lot>(),
      purchased: 0,
      realized: 0,
      incomplete: false,
    };
    for (const leg of confirmed) {
      if (
        !leg.received ||
        !/^\d+$/.test(leg.received) ||
        !/^\d+$/.test(leg.amount)
      ) {
        row.incomplete = true;
        continue;
      }
      const asset = order.kind === "buy" ? leg.to : leg.from,
        key = assetKey(asset);
      const lot = row.lots.get(key) ?? { asset, quantity: 0n, cost: 0 };
      if (order.kind === "buy") {
        if (leg.from.symbol !== "USDC") {
          row.incomplete = true;
          continue;
        }
        const cost = units(leg.amount, leg.from.decimals);
        row.purchased += cost;
        lot.quantity += BigInt(leg.received);
        lot.cost += cost;
      } else {
        const sold = BigInt(leg.amount);
        if (
          leg.to.symbol !== "USDC" ||
          sold > lot.quantity ||
          lot.quantity === 0n
        ) {
          row.incomplete = true;
          continue;
        }
        const cost = lot.cost * (Number(sold) / Number(lot.quantity));
        row.realized += units(leg.received, leg.to.decimals) - cost;
        lot.quantity -= sold;
        lot.cost = lot.quantity === 0n ? 0 : lot.cost - cost;
      }
      row.lots.set(key, lot);
    }
    book.set(order.thesisId, row);
    points.push({
      time: order.createdAt,
      value: [...book.values()].reduce((s, r) => s + r.realized, 0),
    });
  }
  return { rows: [...book.values()], points, trades };
}
export function walletPerformance(
  orders: WalletOrder[],
  prices: Prices,
  now: number,
): Performance {
  const book = walletBook(orders);
  const rows = book.rows.map((row) => {
    const lots = [...row.lots.values()].filter((l) => l.quantity > 0n);
    const value = row.incomplete
      ? null
      : sum(
          lots.map((l) => {
            const price = prices[assetKey(l.asset)];
            return price == null || !Number.isFinite(price) || price <= 0
              ? null
              : units(l.quantity.toString(), l.asset.decimals) * price;
          }),
        );
    const cost = lots.reduce((s, l) => s + l.cost, 0),
      realized = row.incomplete ? null : row.realized;
    return {
      thesisId: row.thesisId,
      title: row.title,
      value,
      cost,
      purchased: row.purchased,
      realized,
      profit:
        value === null || realized === null ? null : realized + value - cost,
      open: lots.length > 0,
      symbols: [...new Set(lots.map((l) => l.asset.symbol))],
    };
  });
  const value = sum(rows.map((r) => r.value)),
    cost = rows.reduce((s, r) => s + r.cost, 0),
    realized = sum(rows.map((r) => r.realized));
  const points =
    realized === null
      ? []
      : [
          { time: (book.points[0]?.time ?? now) - 1, value: 0 },
          ...book.points,
          { time: now, value: realized },
        ];
  return {
    rows,
    points,
    value,
    cost,
    purchased: rows.reduce((s, r) => s + r.purchased, 0),
    realized,
    unrealized: value === null ? null : value - cost,
    profit: sum(rows.map((r) => r.profit)),
    trades: book.trades,
  };
}
export function periodPoints(
  points: Point[],
  days: number | null,
  now: number,
): Point[] {
  if (!points.length) return [];
  const start =
    days === null
      ? points[0].time
      : Math.max(points[0].time, now - days * 86400000);
  const before =
    [...points].reverse().find((p) => p.time <= start) ?? points[0];
  return [
    { time: start, value: before.value },
    ...points.filter((p) => p.time > start),
  ];
}
