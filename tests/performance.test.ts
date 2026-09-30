import { test } from "node:test";
import assert from "node:assert/strict";
import {
  paperPerformance,
  walletPerformance,
  assetKey,
  periodPoints,
  type PaperOrder,
} from "../lib/performance";
import type { WalletOrder, JournalLeg } from "../lib/wallet/types";
import { liveAsset } from "../lib/wallet/networks";
const now = 1_800_000_000_000;
const order = (
  side: string,
  amount: number,
  index: number,
  thesisId = "a",
): PaperOrder => ({
  id: String(index),
  thesisId,
  side,
  amount,
  createdAt: now - 100000 + index * 1000,
});
const position = (amount: number, invested: number, thesisId = "a") => ({
  id: thesisId,
  thesisId,
  amount,
  invested,
  takeProfit: null,
  stopLoss: null,
});
test("paper buys do not create a return and cash stays part of equity", () => {
  const p = paperPerformance(
    [order("buy", 100000, 1)],
    [position(100000, 100000)],
    900000,
    now,
  );
  assert.equal(p.equity, 10000);
  assert.equal(p.performance.profit, 0);
  assert.equal(p.performance.purchased, 1000);
  assert.ok(p.performance.points.every((p) => p.value === 10000));
});
test("scenario revaluation, partial sell and a second thesis reconcile realized and unrealized return", () => {
  const p = paperPerformance(
    [
      order("buy", 100000, 1),
      order("scenario", 120000, 2),
      order("sell", 60000, 3),
      order("buy", 50000, 4, "b"),
      order("scenario", 40000, 5, "b"),
    ],
    [position(60000, 50000), position(40000, 50000, "b")],
    910000,
    now,
  );
  assert.equal(p.equity, 10100);
  assert.equal(p.performance.realized, 100);
  assert.equal(p.performance.unrealized, 0);
  assert.equal(p.performance.profit, 100);
  assert.equal(p.performance.rows[0].profit, 200);
  assert.equal(p.performance.rows[1].profit, -100);
  assert.deepEqual(
    p.performance.points.map((p) => p.value),
    [10000, 10000, 10200, 10200, 10200, 10100, 10100],
  );
});
test("closed exits retain performance beyond the old 20-event activity limit", () => {
  const orders = Array.from({ length: 15 }, (_, i) => [
    order("buy", 10000, i * 2),
    order("rule-exit", 9000, i * 2 + 1),
  ]).flat();
  const p = paperPerformance(orders, [], 985000, now);
  assert.equal(p.performance.realized, -150);
  assert.equal(p.performance.profit, -150);
  assert.equal(p.orders.length, 30);
  assert.equal(p.performance.rows[0].open, false);
  assert.equal(p.performance.purchased, 1500);
});
test("paper cost basis uses the same cent rounding on partial sales", () => {
  const p = paperPerformance(
    [
      order("buy", 10000, 1),
      order("scenario", 13333, 2),
      order("sell", 4444, 3),
    ],
    [position(8889, 6667)],
    994444,
    now,
  );
  assert.equal(p.performance.rows[0].realized, 11.11);
  assert.ok(Math.abs((p.performance.realized ?? 0) - 11.11) < 1e-9);
});
const usdc = liveAsset("USDC", 8453)!,
  eth = liveAsset("ETH", 8453)!;
const fill = (
  kind: "buy" | "sell" | "fund",
  amount: string,
  received: string,
  index: number,
  status: JournalLeg["status"] = "confirmed",
): WalletOrder => ({
  id: String(index),
  wallet: "0x1111111111111111111111111111111111111111",
  thesisId: "a",
  title: "ETH conviction",
  kind,
  chainId: 8453,
  budget: "100000000",
  reserve: "10000000",
  expiresAt: now,
  createdAt: now - 100000 + index * 1000,
  legs: [
    {
      symbol: "ETH",
      from: kind === "sell" ? eth : usdc,
      to: kind === "sell" ? usdc : eth,
      amount,
      received,
      status,
      route: { steps: [] } as unknown as JournalLeg["route"],
      minimum: "0",
      expected: received,
      gasUSD: 12,
      feeUSD: 0,
    },
  ],
});
test("wallet uses confirmed fills, weighted cost and actual sell receipts, excluding funding and reserves", () => {
  const orders = [
    fill("buy", "100000000", "1000000000000000000", 1),
    fill("buy", "200000000", "1000000000000000000", 2),
    fill("sell", "500000000000000000", "100000000", 3),
    fill("fund", "1000000000", "1000000000", 4),
    fill("buy", "100000000", "1000000000000000000", 5, "pending"),
  ].reverse();
  const p = walletPerformance(orders, { [assetKey(eth)]: 200 }, now);
  assert.equal(p.cost, 225);
  assert.equal(p.value, 300);
  assert.equal(p.realized, 25);
  assert.equal(p.unrealized, 75);
  assert.equal(p.profit, 100);
  assert.equal(p.purchased, 300);
  assert.equal(p.trades, 3);
});
test("wallet partial basket includes only confirmed legs; unavailable prices never turn into zero", () => {
  const o = fill("buy", "100000000", "1000000000000000000", 1);
  o.legs.push({ ...o.legs[0], status: "failed" });
  const p = walletPerformance([o], {}, now);
  assert.equal(p.purchased, 100);
  assert.equal(p.value, null);
  assert.equal(p.profit, null);
  assert.equal(p.realized, 0);
  assert.equal(walletPerformance([o], { [assetKey(eth)]: 0 }, now).value, null);
});
test("wallet full sale keeps realized gains with no remaining price requirement", () => {
  const p = walletPerformance(
    [
      fill("buy", "100000000", "1000000000000000000", 1),
      fill("sell", "1000000000000000000", "120000000", 2),
    ],
    {},
    now,
  );
  assert.equal(p.value, 0);
  assert.equal(p.cost, 0);
  assert.equal(p.realized, 20);
  assert.equal(p.profit, 20);
  assert.equal(p.rows[0].open, false);
});
test("wallet missing receipts or unmatched sales suppress incomplete returns", () => {
  const o = fill("buy", "100000000", "1000000000000000000", 1);
  delete o.legs[0].received;
  for (const orders of [
    [o],
    [fill("sell", "1000000000000000000", "120000000", 2)],
  ]) {
    const p = walletPerformance(orders, {}, now);
    assert.equal(p.profit, null);
    assert.equal(p.realized, null);
    assert.equal(p.points.length, 0);
  }
});
test("selected periods carry forward the value before the boundary", () => {
  const day = 86400000,
    points = [
      { time: now - 20 * day, value: 10000 },
      { time: now - 10 * day, value: 10300 },
      { time: now - 2 * day, value: 10200 },
      { time: now, value: 10200 },
    ];
  const selected = periodPoints(points, 7, now);
  assert.equal(selected[0].time, now - 7 * day);
  assert.equal(selected[0].value, 10300);
  assert.equal(selected.at(-1)!.value - selected[0].value, -100);
});
