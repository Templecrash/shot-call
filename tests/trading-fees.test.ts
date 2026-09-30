import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCents, percentAmount, tradingFee } from "../lib/trading-fees";

test("dollar input is exact at cent boundaries and rejects malformed or fractional-cent amounts", () => {
  for (const [text, cents] of [
    ["0.29", 29],
    ["100.01", 10001],
    [".50", 50],
    ["10000", 1000000],
    ["12.", 1200],
  ] as const)
    assert.equal(parseCents(text), cents);
  for (const text of [
    "",
    "1.001",
    "-1",
    "1e3",
    "NaN",
    "Infinity",
    "10,000",
    "9007199254740991",
  ])
    assert.equal(parseCents(text), null);
});
test("fee rounds cents, never overdraws max spend, and slider preserves the balance", () => {
  assert.equal(tradingFee(10000), 5);
  assert.equal(tradingFee(999), 0);
  assert.equal(tradingFee(1000), 1);
  assert.equal(tradingFee(3000), 2);
  for (const available of [0, 1, 29, 10001, 1000000]) {
    const amount = percentAmount(available, 100);
    assert.equal(amount, available);
    assert.ok(amount - tradingFee(amount) >= 0);
    assert.ok(percentAmount(available, 75) <= available);
  }
  assert.throws(() => tradingFee(-1));
  assert.throws(() => tradingFee(1.5));
});

test("real-wallet buys and sells require collection setup; funding stays available", async () => {
  const { assertWalletTradeReady } =
    await import("../lib/wallet/trading-policy");
  assert.throws(() => assertWalletTradeReady("buy"), /fee collection setup/);
  assert.throws(() => assertWalletTradeReady("sell"), /fee collection setup/);
  assert.doesNotThrow(() => assertWalletTradeReady("fund"));
});
