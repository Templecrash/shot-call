import { test } from "node:test";
import assert from "node:assert/strict";
import { createStockLookup, matchIssuerStock, ONDO_TOKEN_LIST, parseStockCatalog } from "../lib/ai/stock-catalog";
import { checkedToken, resolveResearch, sourceObserved } from "../lib/ai/resolve";
import type { AICandidate, AIReport } from "../lib/ai/schema";
import type { ProviderResult } from "../lib/ai/provider";
import { mergedCatalog } from "../lib/token-catalog";
import { tokenIconSources } from "../lib/token-icons";
import { exposureGroups } from "../lib/position-design";

const row = { chainId: 1, address: "0xc9eef266834730340A55B6CC24621B31BAF55581", name: "SpaceX (Ondo Tokenized)", symbol: "SPCXon", logoURI: "https://cdn.ondo.finance/tokens/logos/spcxon_160x160.png" };
const candidate: AICandidate = { name: row.name, symbol: row.symbol, instrument: "stock", coingecko_id: null, exposure: "Direct", official_url: "https://app.ondo.finance/assets/spcxon", source_url: "https://app.ondo.finance/assets/spcxon", weight: 100, watchlist_reason: null, reason: "Stock-backed economic exposure to the space launch company through the issuer’s wrapper.", risk: "Issuer, liquidity, tracking and eligibility risks apply." };
const report: AIReport = { title: "The Launch Economy", summary: "A hypothetical basket of space-company equity exposures.", category: "Stock tokens", risk: candidate.risk, evidence_note: "The forecast remains uncertain.", allocation_rationale: "Paper exposure follows the stated sector thesis.", reserve_weight: 0, candidates: [candidate], products: [] };
const provider: ProviderResult = { report, sources: [{ title: "Issuer asset page", url: candidate.source_url }], responseId: "fixture", model: "fixture", usage: {}, raw: {} };

test("stock discovery uses the issuer registry without CoinGecko and preserves icons and exposure groups", async () => {
  let count = 0;
  const lookup = createStockLookup((async url => { count++; assert.equal(url, ONDO_TOKEN_LIST); return Response.json({ tokens: [row] }); }) as typeof fetch);
  const resolved = await resolveResearch(provider, "I'm bullish on rocket launch stocks", "space-fixture", async () => { throw new Error("No guessed CoinGecko ID should be queried"); }, 1000, lookup);
  const thesis = resolved.thesis!;
  const key = "issuer:ondo:spcxon";
  assert.deepEqual(thesis.allocations, [{ symbol: key, weight: 100 }]);
  assert.equal(thesis.tokens?.[key].instrument, "stock");
  assert.equal(thesis.tokens?.[key].coingeckoId, undefined);
  assert.equal(thesis.tokens?.[key].contract, row.address);
  assert.equal(mergedCatalog([thesis])[key].name, row.name);
  assert.equal(exposureGroups(thesis)[0].kind, "stocks");
  assert.ok(tokenIconSources(thesis.tokens![key], key).includes(row.logoURI));
  assert.match(resolved.research.notes, /issuer’s current token registry/);
  await lookup(candidate);
  assert.equal(count, 1, "one issuer fetch per generation, including multiple candidates");
});

test("issuer verification rejects ticker collisions, generic pages, wrong names and nonexistent stocks", () => {
  const catalog = parseStockCatalog({ tokens: [row] });
  for (const change of [
    { symbol: "SPACEX" }, { name: "Rocket Lab" },
    { official_url: "https://app.ondo.finance/assets/rklbon" },
    { source_url: "https://app.ondo.finance/" },
    { source_url: "https://app.ondo.finance.attacker.example/assets/spcxon" },
  ]) assert.equal(matchIssuerStock({ ...candidate, ...change }, catalog), null);
  assert.equal(matchIssuerStock(candidate, []), null);
  assert.equal(parseStockCatalog({ tokens: [{ ...row, address: "bad" }, { ...row, name: "US Dollar", symbol: "USDon" }] }).length, 0);
  assert.equal(matchIssuerStock(candidate, [...catalog, { ...row, name: "Different company (Ondo Tokenized)" }]), null);
});

test("unobserved or zero-weight stock candidates never become a funded basket", async () => {
  for (const input of [
    { ...provider, sources: [] },
    { ...provider, report: { ...report, candidates: [{ ...candidate, weight: 0, watchlist_reason: "Listing is not confirmed" }] } },
  ]) {
    const resolved = await resolveResearch(input, "Space stocks", "fixture", async () => null, 1000, async c => matchIssuerStock(c, [row]));
    assert.equal(resolved.thesis, null);
    assert.equal(resolved.research.watchlist.length, 1);
  }
});

test("registry outage fails closed without pretending a stock identity is verified", async () => {
  const lookup = createStockLookup((async () => new Response("", { status: 503 })) as typeof fetch);
  assert.equal(await lookup(candidate), null);
});

test("the model cannot relabel a crypto asset as a stock to permit spot shorts", () => {
  const cryptoCandidate = { ...candidate, name: "Bitcoin", symbol: "BTC", coingecko_id: "bitcoin", source_url: "https://bitcoin.org/", official_url: "https://bitcoin.org/" };
  const metadata = { id: "bitcoin", name: "Bitcoin", symbol: "btc", links: { homepage: ["https://bitcoin.org/"] }, categories: ["Cryptocurrency", "Layer 1"] };
  assert.equal(checkedToken(cryptoCandidate, metadata), null);
  const stockMetadata = { id: "spacex-ondo-tokenized-stock", name: row.name, symbol: row.symbol, links: { homepage: [candidate.official_url] }, categories: ["Tokenized Stock"] };
  assert.equal(checkedToken({ ...candidate, coingecko_id: stockMetadata.id }, stockMetadata)?.token.instrument, "stock");
});

test("observed citation matching ignores tracking but preserves asset identity", () => {
  assert.ok(sourceObserved("https://app.ondo.finance/assets/spcxon", [{ url: "https://app.ondo.finance/assets/spcxon?utm_source=search" }]));
  assert.equal(sourceObserved("https://app.ondo.finance/assets/spcxon", [{ url: "https://app.ondo.finance/assets/rklbon" }]), false);
  assert.equal(sourceObserved("https://example.com/asset?id=spcx", [{ url: "https://example.com/asset?id=rklb" }]), false);
});
