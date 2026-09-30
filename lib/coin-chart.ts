import type { Thesis } from "./data";

export const CHART_RANGES = { "1D": 1, "1W": 7, "1M": 30, "3M": 90 } as const;
export type ChartRange = keyof typeof CHART_RANGES;
export type PricePoint = { time: number; price: number };
export type CoinChart = {
  coinId: string;
  range: ChartRange;
  currency: "usd";
  points: PricePoint[];
  fetchedAt: number;
  source: string;
};

// Explicit project identities: ticker symbols and icon filenames are not unique IDs.
export const COIN_IDS: Record<string, string> = {
  STRK: 'starknet',
  MEGA: 'megaeth',
  AZTEC: 'aztec',
  BEAM: 'beam-2',
  ILV: 'illuvium',
  USOON: 'united-states-oil-fund-ondo-tokenized',
  BNOON: 'us-brent-oil-fund-ondo-tokenized',
  ROBO: "robo-token-2",
  PEAQ: "peaq-2",
  AUKI: "auki-labs",
  GEOD: "geodnet",
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XMR: "monero",
  ZEC: "zcash",
  PUMP: "pump-fun",
  POLS: "polkastarter",
  DAO: "dao-maker",
  INJ: "injective",
  GHST: "aavegotchi",
  IMX: "immutable-x",
  RON: "ronin",
  AXS: "axie-infinity",
  USDC: "usd-coin",
  RENDER: "render-token",
  TAO: "bittensor",
  NEAR: "near",
  LINK: "chainlink",
  ONDO: "ondo-finance",
  CARDS: "collector-crypt",
  FWA: "fake-world-assets",
  AKT: "akash-network",
  ATH: "aethir",
  IO: "io",
  GLM: "golem",
  VIRTUAL: "virtual-protocol",
  GALA: "gala",
  SAND: "the-sandbox",
  MANA: "decentraland",
  ENJ: "enjincoin",
};

export function chartCoinId(thesis: Thesis, key: string): string | null {
  if (!thesis.allocations.some((a) => a.symbol === key)) return null;
  const token = thesis.tokens?.[key];
  // Dynamic IDs come from saved, server-verified token identities, never request input.
  const id =
    token?.coingeckoId || (Object.hasOwn(COIN_IDS, key) ? COIN_IDS[key] : null);
  return id && /^[a-z0-9][a-z0-9_-]{0,119}$/.test(id) ? id : null;
}

export function normalizePrices(raw: unknown, now = Date.now()): PricePoint[] {
  if (!Array.isArray(raw)) return [];
  const prices = new Map<number, number>();
  for (const entry of raw) {
    if (!Array.isArray(entry)) continue;
    const [time, price] = entry;
    if (
      typeof time !== "number" ||
      !Number.isFinite(time) ||
      time <= 0 ||
      time > now + 60000 ||
      typeof price !== "number" ||
      !Number.isFinite(price) ||
      price <= 0
    )
      continue;
    prices.set(time, price);
  }
  return [...prices]
    .sort(([a], [b]) => a - b)
    .map(([time, price]) => ({ time, price }));
}

export function chartChange(points: PricePoint[]): number | null {
  if (points.length < 2) return null;
  return (points[points.length - 1].price / points[0].price - 1) * 100;
}

export class CoinChartError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}

export async function fetchCoinChart(
  coinId: string,
  range: ChartRange,
  apiKey?: string,
  fetcher: typeof fetch = fetch,
): Promise<CoinChart> {
  const response = await fetcher(
    `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(coinId)}/market_chart?vs_currency=usd&days=${CHART_RANGES[range]}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent":
          "ShotCall/1.0 (coin price charts; https://supertake-crypto-sascha.saschadarius.chatgpt.site)",
        ...(apiKey ? { "x-cg-demo-api-key": apiKey } : {}),
      },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new CoinChartError(
      response.status === 429
        ? "The price provider is busy. Please try again in a minute."
        : response.status === 404
          ? "Price history is not available for this coin yet."
          : "Price history is temporarily unavailable. Please try again.",
      response.status === 429 ? 429 : response.status === 404 ? 404 : 503,
    );
  const body = (await response.json()) as { prices?: unknown };
  const fetchedAt = Date.now();
  const points = normalizePrices(body.prices, fetchedAt);
  if (points.length < 2)
    throw new CoinChartError(
      "There is not enough price history for this period yet.",
      404,
    );
  return {
    coinId,
    range,
    currency: "usd",
    points,
    fetchedAt,
    source: `https://www.coingecko.com/en/coins/${encodeURIComponent(coinId)}`,
  };
}
