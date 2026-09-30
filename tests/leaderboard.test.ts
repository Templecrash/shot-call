import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paperRankings,
  periodStart,
  assignRanks,
  rankWeeklyPnl,
  type BoardAccount,
  type BoardOrder,
  type BoardPosition,
} from "../lib/leaderboard";
const now = Date.parse("2026-09-29T18:00:00Z");
const creator = (id: string) => ({
  id,
  name: id,
  handle: id,
  twitterUrl: `https://x.com/${id}`,
  avatarUrl: null,
  bio: "",
});
const account = (
  id: string,
  balance: number,
  enrolled = true,
): BoardAccount => ({ userId: id, balance, enrolled, creator: creator(id) });
let seq = 0;
const order = (
  userId: string,
  thesisId: string,
  side: string,
  amount: number,
  date: string,
): BoardOrder => ({
  id: String(seq++),
  userId,
  thesisId,
  side,
  amount,
  createdAt: Date.parse(date),
});
const pos = (
  userId: string,
  thesisId: string,
  amount: number,
): BoardPosition => ({ userId, thesisId, amount });
test("calendar periods use Monday and month boundaries at midnight UTC, including year rollover", () => {
  assert.equal(
    new Date(periodStart("week", now)).toISOString(),
    "2026-09-28T00:00:00.000Z",
  );
  assert.equal(
    new Date(periodStart("month", now)).toISOString(),
    "2026-09-01T00:00:00.000Z",
  );
  assert.equal(
    new Date(
      periodStart("week", Date.parse("2027-01-03T23:59:59Z")),
    ).toISOString(),
    "2026-12-28T00:00:00.000Z",
  );
});
test("week and month carry forward different baselines; buys and partial sells are neutral", () => {
  const orders = [
    order("alice", "a", "buy", 100000, "2026-09-10"),
    order("alice", "a", "scenario", 150000, "2026-09-15"),
    order("alice", "a", "buy", 50000, "2026-09-29T00:00Z"),
    order("alice", "a", "scenario", 220000, "2026-09-29T01:00Z"),
    order("alice", "a", "sell", 70000, "2026-09-29T02:00Z"),
  ];
  const args = [
    [account("alice", 920000)],
    orders,
    [pos("alice", "a", 150000)],
  ] as const;
  const week = paperRankings(...args, "week", now),
    month = paperRankings(...args, "month", now);
  assert.equal(week.takes[0].returnPct, 10);
  assert.equal(week.investors[0].returnPct, 1.9048);
  assert.equal(month.takes[0].returnPct, 46.6667);
  assert.equal(month.investors[0].returnPct, 7);
});
test("fully closed rule exits count, and prior-period closed holdings do not enter the new window", () => {
  const orders = [
    order("alice", "a", "buy", 100000, "2026-09-10"),
    order("alice", "a", "rule-exit", 120000, "2026-09-20"),
    order("alice", "b", "buy", 200000, "2026-09-28"),
    order("alice", "b", "rule-exit", 180000, "2026-09-29"),
  ];
  const result = paperRankings(
    [account("alice", 1000000)],
    orders,
    [],
    "week",
    now,
  );
  assert.equal(result.takes.length, 1);
  assert.equal(result.takes[0].thesisId, "b");
  assert.equal(result.takes[0].returnPct, -10);
  assert.equal(result.investors[0].returnPct, -1.9608);
});
test("take returns weight committed capital across backers, not an average of user percentages", () => {
  const orders = [
    order("alice", "a", "buy", 100000, "2026-09-28"),
    order("alice", "a", "scenario", 110000, "2026-09-29"),
    order("bob", "a", "buy", 900000, "2026-09-28"),
    order("bob", "a", "scenario", 1080000, "2026-09-29"),
  ];
  const result = paperRankings(
    [account("alice", 900000), account("bob", 100000)],
    orders,
    [pos("alice", "a", 110000), pos("bob", "a", 1080000)],
    "week",
    now,
  );
  assert.equal(result.takes[0].returnPct, 19);
  assert.equal(result.takes[0].backers, 2);
  assert.equal(result.investors[0].creator.id, "bob");
  assert.equal(result.investors[0].returnPct, 18);
});
test("uninvested portfolios, opted-out accounts and untraded examples do not enter rankings", () => {
  const result = paperRankings(
    [account("idle", 1000000), account("private", 900000, false)],
    [order("private", "a", "buy", 100000, "2026-09-28")],
    [pos("private", "a", 100000)],
    "week",
    now,
  );
  assert.deepEqual(result.takes, []);
  assert.deepEqual(result.investors, []);
});
test("inconsistent snapshots and invalid orders are excluded instead of publishing wrong returns", () => {
  const result = paperRankings(
    [account("missing", 900000), account("bad", 1000000)],
    [order("bad", "a", "scenario", 100000, "2026-09-28")],
    [pos("missing", "a", 110000)],
    "week",
    now,
  );
  assert.equal(result.excluded, 2);
  assert.equal(result.investors.length, 0);
});
test("buys at the period boundary and complete sells with no repricing produce zero return", () => {
  const result = paperRankings(
    [account("a", 1000000)],
    [
      order("a", "a", "buy", 100000, "2026-09-28T00:00:00Z"),
      order("a", "a", "sell", 100000, "2026-09-29"),
    ],
    [],
    "week",
    now,
  );
  assert.equal(result.takes[0].returnPct, 0);
  assert.equal(result.investors[0].returnPct, 0);
});
test("equal rates share ranks and do not gain an arbitrary tie-break advantage", () => {
  assert.deepEqual(
    assignRanks([
      { returnPct: 10 },
      { returnPct: 10 },
      { returnPct: 0 },
      { returnPct: -5 },
    ]).map((x) => x.rank),
    [1, 1, 3, 4],
  );
});
test("flat held positions carry into the new period without inventing a price change", () => {
  const result = paperRankings(
    [account("a", 900000)],
    [order("a", "a", "buy", 100000, "2026-08-01")],
    [pos("a", "a", 100000)],
    "week",
    now,
  );
  assert.equal(result.takes[0].returnPct, 0);
  assert.equal(result.investors[0].returnPct, 0);
});

test('weekly dollar P&L ranks absolute gains instead of return percentages and shares ties',()=>{
  const scores=paperRankings(
    [account('alice',900000),account('bob',500000)],
    [order('alice','a','buy',100000,'2026-09-28'),order('alice','a','scenario',120000,'2026-09-29'),order('bob','b','buy',500000,'2026-09-28'),order('bob','b','scenario',550000,'2026-09-29')],
    [pos('alice','a',120000),pos('bob','b',550000)],'week',now,
  );
  const ranked=rankWeeklyPnl(scores.investors);
  assert.equal(ranked[0].creator.id,'bob');assert.equal(ranked[0].profitCents,50000);
  assert.equal(ranked[1].profitCents,20000);
  const tied=rankWeeklyPnl([...ranked,{...ranked[0],creator:creator('carol')}]);
  assert.deepEqual(tied.map(row=>row.rank),[1,1,3]);
});

test('Monday reset starts held positions at zero and counts only new gains',()=>{
  const orders=[order('a','held','buy',100000,'2026-09-25'),order('a','held','scenario',150000,'2026-09-27T23:59:59Z')];
  const monday=Date.parse('2026-09-28T00:00:00Z');
  const before=paperRankings([account('a',900000)],orders,[pos('a','held',150000)],'week',monday-1);
  const reset=paperRankings([account('a',900000)],orders,[pos('a','held',150000)],'week',monday);
  assert.equal(before.investors[0].profitCents,50000);
  assert.equal(reset.investors[0].profitCents,0);
  const next=paperRankings([account('a',900000)],[...orders,order('a','held','scenario',155000,'2026-09-29')],[pos('a','held',155000)],'week',now);
  assert.equal(next.investors[0].profitCents,5000);
});

test('weekly P&L includes trade and creator fees while funding and creator income stay neutral',()=>{
  const orders=[
    order('a','a','buy',100000,'2026-09-25'),
    order('a','a','scenario',120000,'2026-09-28'),
    {...order('a','a','sell',120000,'2026-09-29'),tradingFee:2400,creatorFee:100},
    order('a','cash','demo-fund',500000,'2026-09-29'),
    order('a','cash','creator-income',10000,'2026-09-29'),
  ];
  const result=paperRankings([account('a',1527500)],orders,[],'week',now);
  assert.equal(result.investors[0].profitCents,17500);
});

test('negative and zero P&L rank correctly and closed prior-week trades disappear after reset',()=>{
  const row={creator:creator('flat'),takes:1,returnPct:0,profitCents:0};
  const ranked=rankWeeklyPnl([row,{...row,creator:creator('loss'),profitCents:-1000}]);
  assert.equal(ranked[0].creator.id,'flat');assert.equal(ranked[1].rank,2);
  const closed=paperRankings([account('a',1050000)],[order('a','a','buy',100000,'2026-09-25'),order('a','a','rule-exit',150000,'2026-09-27')],[],'week',now);
  assert.equal(closed.investors.length,0);
});
