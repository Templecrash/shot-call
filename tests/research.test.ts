import { test } from "node:test";
import assert from "node:assert/strict";
import { curatedTake, EXAMPLES, TOKENS } from "../lib/data";
import { GACHA_CANDIDATES, ecosystemProducts, tokenFit } from "../lib/research";
import { MAX_THESIS_TOKENS } from "../lib/limits";
import { liveAsset } from "../lib/wallet/networks";

const thesis = (id: string) => EXAMPLES.find((t) => t.id === id)!;

test("gacha and gaming takes resolve to different, contextually correct baskets", () => {
  for (const prompt of [
    "Gacha is going to be huge",
    "Gotcha tokens will rip",
    "I am big on gotchas",
    "Phygitals and Beezie are the future",
    "Gatcha machines are growing",
    "Collector Crypt on Solana wins",
    "NFT gacha on Ethereum is the next big thing",
  ]) {
    const take = curatedTake(prompt)!;
    assert.equal(take.category, "Gacha & collectibles");
    assert.deepEqual(
      take.allocations.map((a) => a.symbol),
      ["CARDS", "FWA"],
    );
    assert.equal(take.example, false);
  }
  assert.equal(curatedTake("Onchain games are growing")?.category, "Gaming");
  assert.equal(curatedTake("Axie is building an economy")?.category, "Gaming");
  assert.equal(curatedTake("Data collection will grow"), null);
  assert.equal(curatedTake("Travel agents are popular"), null);
});

test("gacha exposure weights remain proportional without a default reserve", () => {
  assert.deepEqual(thesis("gacha-supercycle").allocations, [
    { symbol: "GHST", weight: 39 },
    { symbol: "IMX", weight: 28 },
    { symbol: "RON", weight: 22 },
    { symbol: "AXS", weight: 11 },
  ]);
  assert.equal(thesis("gacha-collectibles").parent, "gacha-supercycle");
  assert.equal(tokenFit(thesis("gacha-supercycle"), "GHST").kind, "Adjacent");
  assert.equal(tokenFit(thesis("onchain-gaming"), "GHST").kind, "Direct");
  assert.equal(
    tokenFit(thesis("gacha-supercycle"), "IMX").kind,
    "Infrastructure",
  );
});

test("fit describes the role in this thesis, including proxies and unmatched tokens", () => {
  assert.equal(tokenFit(thesis("stock-tokens-win"), "ONDO").kind, "Platform");
  for (const symbol of ["INJ", "LINK", "SOL"])
    assert.equal(
      tokenFit(thesis("stock-tokens-win"), symbol).kind,
      "Infrastructure",
    );
  assert.equal(
    tokenFit(thesis("intelligence-economy"), "RENDER").kind,
    "Adjacent",
  );
  assert.equal(tokenFit(thesis("intelligence-economy"), "TAO").kind, "Direct");
  assert.equal(tokenFit(thesis("privacy-repriced"), "GHST").kind, "Unmatched");
  assert.equal(tokenFit(thesis("privacy-repriced"), "USDC").kind, "Unmatched");
});

test("ticker collisions remain separate projects and watchlist tokens cannot be allocated", () => {
  const gacha = GACHA_CANDIDATES.filter((c) => c.symbol === "GACHA");
  assert.equal(gacha.length, 2);
  assert.equal(new Set(gacha.map((c) => c.id)).size, 2);
  assert.equal(new Set(gacha.map((c) => c.source)).size, 2);
  for (const c of GACHA_CANDIDATES.filter((c) => !c.basketSymbol))
    assert.equal(TOKENS[c.symbol], undefined);
  assert.equal(
    GACHA_CANDIDATES.find((c) => c.id === "powergacha")?.status,
    "Migration",
  );
});

test("verified direct identities remain paper-only without a supported wallet integration", () => {
  for (const symbol of ["CARDS", "FWA"]) {
    const candidate = GACHA_CANDIDATES.find((c) => c.symbol === symbol)!;
    assert.ok(candidate.address);
    assert.equal(candidate.status, "Identity checked");
    assert.equal(candidate.kind, "Direct");
    assert.equal(candidate.basketSymbol, symbol);
    for (const chain of [1, 8453, 42161, 10, 137, 43114])
      assert.equal(liveAsset(symbol, chain), undefined);
  }
});

test("every example has valid weights, a product directory and an assessed role for each allocation", () => {
  for (const t of EXAMPLES) {
    assert.ok(t.allocations.length<=MAX_THESIS_TOKENS);
    assert.equal(new Set(t.allocations.map(a=>a.symbol)).size,t.allocations.length);
    assert.equal(
      t.allocations.reduce((s, a) => s + a.weight, 0),
      100,
    );
    assert.ok(ecosystemProducts(t).length >= 2);
    for (const a of t.allocations)
      assert.notEqual(
        tokenFit(t, a.symbol).kind,
        "Unmatched",
        `${t.id} ${a.symbol}`,
      );
    for (const p of ecosystemProducts(t))
      assert.equal(new URL(p.url).protocol, "https:");
  }
  const custom = { ...thesis("privacy-repriced"), category: "Custom" };
  assert.deepEqual(ecosystemProducts(custom), []);
  assert.equal(tokenFit(custom, "XMR").kind, "Unmatched");
});

test("the supplied example theses retain their individual matching and catalyst qualification", () => {
  const cases = [
    ["Privacy coins are going to rip", "Privacy"],
    ["This is the bottom for the majors", "Majors"],
    [
      "ETH is positioned to run to 7,000 based on the new paper Vitalik released",
      "Ethereum",
    ],
    ["Launchpads are the only thing worth investing in", "Launchpads"],
    ["Stock token platforms are going to win", "Stock tokens"],
  ];
  for (const [prompt, category] of cases)
    assert.equal(curatedTake(prompt)?.category, category);
  assert.match(
    curatedTake(cases[2][0])!.evidenceNote!,
    /not identified or assessed/,
  );
  assert.equal(
    curatedTake("Ethereum adoption will increase")?.title,
    "The Ethereum Thesis",
  );
});


test('expanded AI and gaming examples use nine relevant holdings without reserve padding',()=>{
  for(const [id,prompt] of [['intelligence-economy','AI needs more compute'],['onchain-gaming','Onchain games will grow']]){
    const full=thesis(id+'-expanded');assert.equal(full.allocations.length,9);assert.equal(full.parent,id);assert.equal(full.version,2);assert.equal(thesis(id).allocations.length,4);
    assert.equal(curatedTake(prompt)?.allocations.length,9);
    for(const a of full.allocations){assert.ok(a.weight>0);assert.notEqual(tokenFit(full,a.symbol).kind,'Unmatched');assert.ok(TOKENS[a.symbol].source.startsWith('https://'));}
  }
});


test('only the explicit stables example contains USDC and all exposure examples remain fully allocated',()=>{
 for(const t of EXAMPLES){
  assert.equal(t.allocations.reduce((sum,a)=>sum+a.weight,0),100,t.id);
  assert.equal(t.allocations.some(a=>a.symbol==='USDC'),t.id==='week-in-stables',t.id);
 }
 const t=curatedTake('Be in stables for this next week')!;
 assert.equal(t.category,'Stables');assert.deepEqual(t.allocations,[{symbol:'USDC',weight:100}]);
 assert.deepEqual(thesis('eth-to-7000').allocations,[{symbol:'ETH',weight:100}]);
});
