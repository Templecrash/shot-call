import { predictionFlow } from "./predictions/model";
import type { Creator } from "./creators";
import type { PaperOrder } from "./performance";

export type BoardPeriod = "week" | "month";
export type BoardAccount = {
  userId: string;
  balance: number;
  creator: Creator;
  enrolled: boolean;
};
export type BoardOrder = PaperOrder & { userId: string };
export type BoardPosition = {
  userId: string;
  thesisId: string;
  amount: number;
};
export type TakeScore = {
  thesisId: string;
  returnPct: number;
  backers: number;
};
export type InvestorScore = {
  creator: Creator;
  profitCents: number;
  returnPct: number;
  takes: number;
};
export type RankedInvestor = InvestorScore & { rank: number };
export type LeaderboardData = {
  start: number;
  resetsAt: number;
  checkedAt: number;
  entries: RankedInvestor[];
  participants: number;
  excluded: number;
  basis: "paper";
};

export function periodStart(period: BoardPeriod, now: number): number {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  if (period === "month") d.setUTCDate(1);
  else d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.getTime();
}
const validAmount = (n: number) => Number.isSafeInteger(n) && n >= 0;
const percent = (n: number, d: number) => Math.round((n / d) * 1e6) / 1e4;

// Replay complete ledgers. Trade cash flows move capital; only repricing creates
// a gain. Account snapshots must reconcile before any participant is ranked.
export function paperRankings(
  accounts: readonly BoardAccount[],
  orders: readonly BoardOrder[],
  positions: readonly BoardPosition[],
  period: BoardPeriod,
  now: number,
) {
  const start = periodStart(period, now),
    byUser = new Map<string, BoardOrder[]>(),
    positionByUser = new Map<string, BoardPosition[]>();
  for (const o of orders) {
    const list = byUser.get(o.userId) || [];
    list.push(o);
    byUser.set(o.userId, list);
  }
  for (const p of positions) {
    const list = positionByUser.get(p.userId) || [];
    list.push(p);
    positionByUser.set(p.userId, list);
  }
  const takeTotals = new Map<
      string,
      { capital: number; profit: number; backers: number }
    >(),
    investors: InvestorScore[] = [];
  let excluded = 0;
  for (const account of accounts) {
    if (!account.enrolled) continue;
    const ledger = (byUser.get(account.userId) || [])
      .filter((o) => o.createdAt <= now)
      .sort((a, b) => a.createdAt - b.createdAt);
    const book = new Map<string, number>(),
      metrics = new Map<string, { capital: number; profit: number }>();
    let predictionCashFlow = 0,
      cash = 1_000_000,
      baseline = 1_000_000,
      started = false,
      invalid = false,
      growth = 1,
      segmentBase = 1_000_000;
    function begin() {
      if (started) return;
      started = true;
      baseline =
        cash -
        predictionCashFlow +
        [...book.values()].reduce((a, b) => a + b, 0);
      segmentBase = baseline;
      for (const [id, value] of book)
        if (value > 0) metrics.set(id, { capital: value, profit: 0 });
    }
    for (const o of ledger) {
      if (!validAmount(o.amount) || !Number.isFinite(o.createdAt)) {
        invalid = true;
        break;
      }
      if (o.createdAt >= start) begin();
      const bettingFlow = predictionFlow(o.side, o.amount);
      if (bettingFlow !== null) {
        cash += bettingFlow;
        predictionCashFlow += bettingFlow;
        if (!validAmount(cash)) {
          invalid = true;
          break;
        }
        continue;
      }
      if (o.side === "creator-income" || o.side === "demo-fund") {
        const equityBefore =
          cash -
          predictionCashFlow +
          [...book.values()].reduce((s, v) => s + v, 0);
        if (started) {
          if (segmentBase <= 0) {
            invalid = true;
            break;
          }
          growth *= equityBefore / segmentBase;
          segmentBase = equityBefore + o.amount;
        }
        cash += o.amount;
        continue;
      }
      const creatorFee = o.creatorFee || 0,
        platformFee = o.tradingFee || 0;
      const profitFee=o.platformProfitFee||0;
      const fee = creatorFee + platformFee+profitFee;
      if (
        !validAmount(creatorFee) ||
        !validAmount(platformFee) ||
        !validAmount(profitFee) ||
        (profitFee>0&&!["sell","rule-exit"].includes(o.side)) ||
        fee > o.amount ||
        (creatorFee > 0 && !["sell", "rule-exit"].includes(o.side)) ||
        (platformFee > 0 && !["buy", "sell", "rule-exit"].includes(o.side))
      ) {
        invalid = true;
        break;
      }
      const previous = book.get(o.thesisId) || 0;
      const metric = metrics.get(o.thesisId) || { capital: 0, profit: 0 };
      if (o.side === "buy") {
        cash -= o.amount;
        book.set(o.thesisId, previous + o.amount - platformFee);
        if (started) metric.capital += o.amount;
      } else if (o.side === "sell") {
        if (o.amount > previous) {
          invalid = true;
          break;
        }
        cash += o.amount - fee;
        book.set(o.thesisId, previous - o.amount);
      } else if (o.side === "scenario" || o.side === "rule-exit") {
        if (previous <= 0) {
          invalid = true;
          break;
        }
        if (started) metric.profit += o.amount - previous;
        if (o.side === "rule-exit") {
          cash += o.amount - fee;
          book.set(o.thesisId, 0);
        } else book.set(o.thesisId, o.amount);
      } else {
        invalid = true;
        break;
      }
      if (started) {
        metric.profit -= fee;
        metrics.set(o.thesisId, metric);
      }
      if (!validAmount(cash)) {
        invalid = true;
        break;
      }
    }
    begin();
    const snapshot = positionByUser.get(account.userId) || [];
    const snapshotMap = new Map(snapshot.map((p) => [p.thesisId, p.amount]));
    const ids = new Set([...book.keys(), ...snapshotMap.keys()]);
    if (
      invalid ||
      !validAmount(account.balance) ||
      account.balance !== cash ||
      snapshot.some((p) => !validAmount(p.amount)) ||
      [...ids].some(
        (id) => (book.get(id) || 0) !== (snapshotMap.get(id) || 0),
      ) ||
      baseline <= 0
    ) {
      excluded++;
      continue;
    }
    const active = [...metrics].filter(([, m]) => m.capital > 0);
    if (!active.length) continue;
    const equity =
      cash - predictionCashFlow + [...book.values()].reduce((a, b) => a + b, 0);
    investors.push({
      creator: account.creator,
      profitCents: active.reduce((sum, [, metric]) => sum + metric.profit, 0),
      returnPct: percent(growth * (equity / segmentBase) - 1, 1),
      takes: active.length,
    });
    for (const [id, m] of active) {
      const total = takeTotals.get(id) || { capital: 0, profit: 0, backers: 0 };
      total.capital += m.capital;
      total.profit += m.profit;
      total.backers++;
      takeTotals.set(id, total);
    }
  }
  const takes: TakeScore[] = [...takeTotals].map(([thesisId, t]) => ({
    thesisId,
    returnPct: percent(t.profit, t.capital),
    backers: t.backers,
  }));
  takes.sort(
    (a, b) => b.returnPct - a.returnPct || a.thesisId.localeCompare(b.thesisId),
  );
  investors.sort(
    (a, b) =>
      b.returnPct - a.returnPct || a.creator.id.localeCompare(b.creator.id),
  );
  return { takes, investors, start, excluded };
}

// Dollar P&L is kept in cents so equal published amounts share an exact rank.
export function rankWeeklyPnl(rows: readonly InvestorScore[]): RankedInvestor[] {
  const sorted = [...rows].sort((a,b)=>b.profitCents-a.profitCents||a.creator.id.localeCompare(b.creator.id));
  let rank=0;
  return sorted.map((row,index)=>{
    if(index===0||row.profitCents!==sorted[index-1].profitCents)rank=index+1;
    return {...row,rank};
  });
}

// Equal published percentages share a competition rank (1, 1, 3).
export function assignRanks<T extends { returnPct: number }>(
  rows: T[],
): (T & { rank: number })[] {
  let rank = 0;
  return rows.map((row, i) => {
    if (
      i === 0 ||
      Math.round(row.returnPct * 100) !==
        Math.round(rows[i - 1].returnPct * 100)
    )
      rank = i + 1;
    return { ...row, rank };
  });
}
export function formatReturn(value: number) {
  if (Math.abs(value) < 0.005) return "0.00%";
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}%`;
}
