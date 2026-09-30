import assert from "node:assert/strict";
import test from "node:test";
import { EXAMPLES, TOKENS, type Thesis } from "../lib/data";
import {
  chartCoinId,
  chartChange,
  fetchCoinChart,
  normalizePrices,
  CoinChartError,
} from "../lib/coin-chart";

const thesis = EXAMPLES.find((t) => t.id === "everything-onchain")!;
test("chart identities are allocated, explicit and not confused with icon slugs", () => {
  assert.equal(chartCoinId(thesis, "ONDO"), "ondo-finance");
  assert.equal(chartCoinId(thesis, "BTC"), null);
  assert.equal(chartCoinId(thesis, "__proto__"), null);
  const expanded = EXAMPLES.find(
    (t) => t.id === "intelligence-economy-expanded",
  )!;
  assert.equal(chartCoinId(expanded, "IO"), "io");
  assert.equal(chartCoinId(expanded, "GLM"), "golem");
  for (const key of Object.keys(TOKENS)) {
    if(TOKENS[key].instrument==='prediction'){
      assert.equal(chartCoinId({...thesis,allocations:[{symbol:key,weight:100}]},key),null);
      continue;
    }
    assert.ok(
      chartCoinId(
        { ...thesis, allocations: [{ symbol: key, weight: 100 }] },
        key,
      ),
      `${key} has a chart mapping`,
    );
  }
});
test("generated baskets use their saved verified coin ID", () => {
  const dynamic: Thesis = {
    ...thesis,
    allocations: [{ symbol: "cg:test-coin", weight: 100 }],
    tokens: { "cg:test-coin": { ...TOKENS.ONDO, coingeckoId: "test-coin" } },
  };
  assert.equal(chartCoinId(dynamic, "cg:test-coin"), "test-coin");
  dynamic.tokens!["cg:test-coin"].coingeckoId = "../../untrusted";
  assert.equal(chartCoinId(dynamic, "cg:test-coin"), null);
});
test("provider points are sorted, deduplicated and invalid prices never become chart values", () => {
  assert.deepEqual(
    normalizePrices(
      [
        [300, 2],
        [100, 1],
        [300, 3],
        [150, null],
        [160, 0],
        [170, -2],
        ["180", 4],
        [190, Infinity],
        [Infinity, 2],
        [100000, 8],
        "bad",
      ],
      1000,
    ),
    [
      { time: 100, price: 1 },
      { time: 300, price: 3 },
    ],
  );
  assert.deepEqual(normalizePrices(null), []);
  assert.equal(
    chartChange([
      { time: 100, price: 2 },
      { time: 200, price: 3 },
    ]),
    50,
  );
  assert.equal(
    chartChange([
      { time: 100, price: 2 },
      { time: 200, price: 1 },
    ]),
    -50,
  );
  assert.equal(chartChange([]), null);
});
test("history requests the exact project and period in USD with source attribution", async () => {
  let url = "",
    headers: Headers | undefined;
  const fake = (async (input: string | URL | Request, init?: RequestInit) => {
    url = String(input);
    headers = new Headers(init?.headers);
    return Response.json({
      prices: [
        [100, 0.3],
        [200, 0.6],
      ],
    });
  }) as typeof fetch;
  const result = await fetchCoinChart(
    "ondo-finance",
    "3M",
    "private-test-key",
    fake,
  );
  assert.equal(
    url,
    "https://api.coingecko.com/api/v3/coins/ondo-finance/market_chart?vs_currency=usd&days=90",
  );
  assert.equal(headers?.get("x-cg-demo-api-key"), "private-test-key");
  assert.match(headers?.get("user-agent") || "", /Calledit\.ai/);
  assert.equal(result.range, "3M");
  assert.equal(
    result.source,
    "https://www.coingecko.com/en/coins/ondo-finance",
  );
  assert.equal(result.points.length, 2);
  assert.ok(!JSON.stringify(result).includes("private-test-key"));
});
test("provider failures and short histories are surfaced without invented chart data", async () => {
  const fake = (status: number, prices?: unknown) =>
    (async () => Response.json({ prices }, { status })) as typeof fetch;
  await assert.rejects(
    fetchCoinChart("ondo-finance", "1D", undefined, fake(429)),
    (e: unknown) => e instanceof CoinChartError && e.status === 429,
  );
  await assert.rejects(
    fetchCoinChart("ondo-finance", "1D", undefined, fake(404)),
    /not available/,
  );
  await assert.rejects(
    fetchCoinChart("ondo-finance", "1D", undefined, fake(200, [[100, 1]])),
    /not enough price history/,
  );
});
