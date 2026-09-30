import { TOKENS, type Thesis } from "./data";
import { tokenFor } from "./token-catalog";
import {externalStrategy} from './external-strategy';

export type PerpMarket = {
  symbol: string;
  maxLeverage: number;
  maintenanceBps: number;
  markPrice: number;
  funding: number;
};
export type PerpLeg = PerpMarket & {
  key: string;
  name: string;
  weight: number;
};
export type PerpCoverage = {
  venue: "Hyperliquid";
  checkedAt: number;
  legs: PerpLeg[];
  unavailable: { key: string; symbol: string; weight: number }[];
  weight: number;
  maxLeverage: number;
  maintenanceBps: number;
};
// These identities are pinned separately from the thesis's display ticker.
const identities: Record<string, string> = {
  DOGE: "dogecoin",
  XRP: "ripple",
  HYPE: "hyperliquid",
  SUI: "sui",
  AVAX: "avalanche-2",
  BNB: "binancecoin",
  ADA: "cardano",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  DOT: "polkadot",
  UNI: "uniswap",
  AAVE: "aave",
  ARB: "arbitrum",
  OP: "optimism",
  APT: "aptos",
  ENA: "ethena",
  CRV: "curve-dao-token",
  LDO: "lido-dao",
  TRX: "tron",
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XMR: "monero",
  ZEC: "zcash",
  PUMP: "pump-fun",
  INJ: "injective",
  LINK: "chainlink",
  IMX: "immutable-x",
  AXS: "axie-infinity",
  RENDER: "render-token",
  TAO: "bittensor",
  NEAR: "near",
  GALA: "gala",
  SAND: "the-sandbox",
  IO: "io-net",
  VIRTUAL: "virtual-protocol",
  ONDO: "ondo-finance",
};
export function parsePerpMarkets(payload: unknown): PerpMarket[] {
  if (!Array.isArray(payload) || payload.length !== 2)
    throw new Error("Perp market data is unavailable.");
  const meta = payload[0] as {
      universe?: { name: string; maxLeverage: number; isDelisted?: boolean }[];
    },
    contexts = payload[1];
  if (
    !Array.isArray(meta?.universe) ||
    !Array.isArray(contexts) ||
    contexts.length !== meta.universe.length
  )
    throw new Error("Perp market data is incomplete.");
  return meta.universe.flatMap((m, i) => {
    const c = contexts[i] as { markPx?: string; funding?: string };
    const markPrice = Number(c?.markPx),
      funding = Number(c?.funding);
    if (
      m.isDelisted ||
      !/^[A-Z0-9]+$/.test(m.name) ||
      !Number.isInteger(m.maxLeverage) ||
      m.maxLeverage < 1 ||
      !(markPrice > 0) ||
      !Number.isFinite(markPrice) ||
      !Number.isFinite(funding)
    )
      return [];
    return [
      {
        symbol: m.name,
        maxLeverage: m.maxLeverage,
        maintenanceBps: Math.ceil(10000 / (2 * m.maxLeverage)),
        markPrice,
        funding,
      },
    ];
  });
}
export function perpMarketFor(thesis:Thesis,key:string,markets:PerpMarket[]):PerpMarket|undefined {
  const token=tokenFor(thesis,key);
  if(token.instrument||key==='USDC')return undefined;
  const canonical=Object.keys(identities).find(symbol=>(key===symbol&&Object.hasOwn(TOKENS,symbol))||(key.startsWith('cg:')&&token.coingeckoId===identities[symbol]));
  return canonical?markets.find(m=>m.symbol===canonical):undefined;
}
export function creatorPerpCoverage(thesis:Thesis,markets:PerpMarket[],checkedAt=Date.now()):PerpCoverage {
 const legs:PerpLeg[]=[],unavailable:PerpCoverage['unavailable']=[];
 for(const a of thesis.allocations.filter(a=>a.weight>0)){
  const market=perpMarketFor(thesis,a.symbol,markets);
  if(market)legs.push({...market,key:a.symbol,name:tokenFor(thesis,a.symbol).name,weight:a.weight});
  else unavailable.push({key:a.symbol,symbol:tokenFor(thesis,a.symbol).symbol,weight:a.weight});
 }
 return {venue:'Hyperliquid',checkedAt,legs,unavailable,weight:legs.reduce((n,l)=>n+l.weight,0),maxLeverage:legs.length?Math.min(10,...legs.map(l=>l.maxLeverage)):1,maintenanceBps:legs.length?Math.max(...legs.map(l=>l.maintenanceBps)):0};
}
export async function loadCreatorCoverage(thesis:Thesis,fresh=false){const data=await loadPerpMarkets(fresh);return creatorPerpCoverage(thesis,data.markets,data.checkedAt);}
export function perpCoverage(
  thesis: Thesis,
  markets: PerpMarket[],
  checkedAt = Date.now(),
): PerpCoverage {
  if(externalStrategy(thesis))return {venue:'Hyperliquid',checkedAt,legs:[],unavailable:thesis.allocations.filter(a=>a.symbol!=='USDC'&&a.weight>0).map(a=>({key:a.symbol,symbol:tokenFor(thesis,a.symbol).symbol,weight:a.weight})),weight:0,maxLeverage:1,maintenanceBps:0};
  const legs: PerpLeg[] = [],
    unavailable: PerpCoverage["unavailable"] = [];
  for (const a of thesis.allocations.filter((a) => a.weight > 0)) {
    if (a.symbol === "USDC") continue;
    const token = tokenFor(thesis, a.symbol);
    const canonical = Object.keys(identities).find(
      (key) =>
        (a.symbol === key && Object.hasOwn(TOKENS, key)) ||
        (a.symbol.startsWith("cg:") && token.coingeckoId === identities[key]),
    );
    const market = canonical
      ? markets.find((m) => m.symbol === canonical)
      : undefined;
    if (market)
      legs.push({
        ...market,
        key: a.symbol,
        name: token.name,
        weight: a.weight,
      });
    else
      unavailable.push({
        key: a.symbol,
        symbol: token.symbol,
        weight: a.weight,
      });
  }
  return {
    venue: "Hyperliquid",
    checkedAt,
    legs,
    unavailable,
    weight: legs.reduce((s, l) => s + l.weight, 0),
    maxLeverage: legs.length
      ? Math.min(10, ...legs.map((l) => l.maxLeverage))
      : 1,
    maintenanceBps: legs.length
      ? Math.max(...legs.map((l) => l.maintenanceBps))
      : 0,
  };
}
let cached:
  { expires: number; markets: PerpMarket[]; checkedAt: number } | undefined;
let pending: Promise<{markets: PerpMarket[]; checkedAt: number}> | undefined;
export async function loadPerpMarkets(fresh = false): Promise<{markets: PerpMarket[]; checkedAt: number}> {
  if (!fresh && cached && cached.expires >= Date.now()) return cached;
  if (!fresh && pending) return pending;
  const request = (async () => {
    const response = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "metaAndAssetCtxs" }),
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
      throw new Error(
        "Perp availability could not be verified. Retry shortly.",
      );
    const markets = parsePerpMarkets(await response.json()),
      checkedAt = Date.now();
    cached = { markets, checkedAt, expires: checkedAt + 60000 };
    return {markets, checkedAt};
  })();
  if (!fresh) pending = request;
  try { return await request; }
  finally { if (pending === request) pending = undefined; }
}
export async function loadPerpCoverage(
  thesis: Thesis,
  fresh = false,
): Promise<PerpCoverage> {
  if(externalStrategy(thesis))return perpCoverage(thesis,[]);
  const snapshot = await loadPerpMarkets(fresh);
  return perpCoverage(thesis, snapshot.markets, snapshot.checkedAt);
}
export function perpNotional(margin: number, weight: number, leverage: number) {
  return Math.round((margin * weight * leverage) / 100);
}
export function liquidationMove(
  equity: number,
  notional: number,
  maintenanceBps: number,
): number | null {
  const mm = maintenanceBps / 10000;
  return notional > 0
    ? Math.max(0, ((equity - notional * mm) / (notional * (1 - mm))) * 100)
    : null;
}
// Match the demo's shared-collateral scenario: every supported long moves by
// the same percentage. These are scenario prices, not independent venue orders.
export function liquidationPrices(
  coverage: PerpCoverage,
  equity: number,
  notional: number,
  maintenanceBps = coverage.maintenanceBps,
) {
  if (!Number.isFinite(equity) || equity <= 0 || !Number.isFinite(notional) || notional <= 0 || !coverage.legs.length || coverage.legs.some(leg => !Number.isFinite(leg.markPrice) || leg.markPrice <= 0))
    return null;
  const move = liquidationMove(equity, notional, maintenanceBps);
  if (move === null || !Number.isFinite(move)) return null;
  return {
    move,
    legs: coverage.legs.map(leg => ({
      key: leg.key,
      symbol: leg.symbol,
      referencePrice: leg.markPrice,
      liquidationPrice: move >= 100 ? null : leg.markPrice * (1 - move / 100),
    })),
  };
}
export function perpScenario(
  equity: number,
  notional: number,
  change: number,
  maintenanceBps: number,
) {
  const nextNotional = Math.round(notional * (1 + change / 100));
  const nextEquity = Math.max(
    0,
    equity + Math.round((notional * change) / 100),
  );
  return {
    amount: nextEquity,
    notional: nextNotional,
    liquidated:
      nextEquity <= Math.ceil((nextNotional * maintenanceBps) / 10000),
  };
}
