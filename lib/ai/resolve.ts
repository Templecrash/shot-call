import { evidenceFingerprint, verifiedEvidence } from "../evidence/core";
import { TOKENS, type Thesis, type Token } from "../data";
import type { AIResearch } from "./types";
import { publicUrl, type AICandidate } from "./schema";
import type { ProviderResult } from "./provider";
import {fullExposure,isStablecoin,wantsStablecoins} from "../allocations";
const KNOWN_IDS: Record<string, string> = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  monero: "XMR",
  zcash: "ZEC",
  "pump-fun": "PUMP",
  polkastarter: "POLS",
  "dao-maker": "DAO",
  injective: "INJ",
  aavegotchi: "GHST",
  "immutable-x": "IMX",
  ronin: "RON",
  "axie-infinity": "AXS",
  "usd-coin": "USDC",
  "render-token": "RENDER",
  bittensor: "TAO",
  near: "NEAR",
  chainlink: "LINK",
  "ondo-finance": "ONDO",
  "collector-crypt": "CARDS",
  "fake-world-assets": "FWA",
};
export type CoinMetadata = {
  id: string;
  name: string;
  symbol: string;
  image?: { small?: string };
  links?: { homepage?: string[] };
  platforms?: Record<string, string>;
  asset_platform_id?: string | null;
  preview_listing?: boolean;
  verification?: "reviewed-catalog";
  identitySource?: string;
};
export const normalizeUrl = (s: string) => {
  try {
    const u = new URL(s);
    u.hash = "";
    return u.href.replace(/\/$/, "");
  } catch {
    return "";
  }
};
const host = (s: string) => {
  try {
    return new URL(s).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
function sameProject(a: string, b: string): boolean {
  const x = host(a),
    y = host(b);
  return !!x && !!y && (x === y || x.endsWith("." + y) || y.endsWith("." + x));
}
export function sourceObserved(
  url: string,
  sources: { url: string }[],
): boolean {
  return sources.some((s) => normalizeUrl(s.url) === normalizeUrl(url));
}
export function checkedToken(
  c: AICandidate,
  coin: CoinMetadata,
): { key: string; token: Token } | null {
  if (
    coin.id !== c.coingecko_id ||
    coin.symbol?.toUpperCase() !== c.symbol.toUpperCase() ||
    coin.preview_listing
  )
    return null;
  const homes = (coin.links?.homepage || []).filter(
    (s) => s && /^https?:\/\//.test(s),
  );
  if (
    !homes.some((h) => sameProject(h, c.official_url)) ||
    !homes.some((h) => sameProject(h, c.source_url))
  )
    return null;
  const known = Object.hasOwn(KNOWN_IDS, coin.id)
    ? KNOWN_IDS[coin.id]
    : undefined;
  if (known === "USDC") return null;
  const base = known ? TOKENS[known] : undefined;
  if (base && base.symbol.toUpperCase() !== coin.symbol.toUpperCase())
    return null;
  const image = coin.image?.small;
  const safeImage =
    image &&
    publicUrl(image) &&
    ["assets.coingecko.com", "coin-images.coingecko.com"].includes(
      new URL(image).hostname,
    )
      ? image
      : undefined;
  const chain = coin.asset_platform_id || undefined;
  return {
    key: known || `cg:${coin.id}`,
    token: {
      symbol: coin.symbol.toUpperCase(),
      name: coin.name.slice(0, 80),
      color: base?.color || "#607957",
      icon: coin.id,
      image: base?.image || (base ? `/coins/${known}.png` : safeImage),
      fit: {
        Direct: "Product / network token",
        Platform: "Platform governance",
        Adjacent: "Related market exposure",
        Infrastructure: "Enabling infrastructure",
      }[c.exposure],
      kind: c.exposure,
      reason: c.reason,
      risk: c.risk,
      source: c.source_url,
      coingeckoId: coin.id,
      identitySource: coin.verification === "reviewed-catalog" ? coin.identitySource : `https://www.coingecko.com/en/coins/${coin.id}`,
      chain,
      contract: chain ? coin.platforms?.[chain] : undefined,
    },
  };
}
// A service outage must not erase already reviewed identities. This is an
// identity fallback only: AI still selects the assets, fit and allocation.
// Unknown IDs and explicit delisting/invalid responses continue to fail closed.
function reviewedCoin(id: string): CoinMetadata | null {
  const matches = Object.values(TOKENS).filter(token => !token.instrument && (token.coingeckoId || token.icon) === id);
  if (matches.length !== 1) return null;
  const token = matches[0];
  if (!publicUrl(token.source)) return null;
  const chain = token.chain?.toLowerCase();
  return {
    id, name: token.name, symbol: token.symbol,
    links: { homepage: [token.source] },
    asset_platform_id: chain,
    platforms: chain && token.contract ? { [chain]: token.contract } : {},
    verification: "reviewed-catalog",
    identitySource: token.source,
  };
}
export async function fetchCoin(
  id: string,
  key?: string,
  fetcher: typeof fetch = fetch,
): Promise<CoinMetadata | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,100}$/.test(id)) return null;
  try {
    const r = await fetcher(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`,
      {
        headers: {
          Accept: "application/json",
          ...(key ? { "x-cg-demo-api-key": key } : {}),
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!r.ok) return [401, 403, 408, 429].includes(r.status) || r.status >= 500 ? reviewedCoin(id) : null;
    let data: CoinMetadata;
    try { data = (await r.json()) as CoinMetadata; } catch { return null; }
    return data &&
      typeof data.name === "string" &&
      typeof data.symbol === "string" &&
      data.id === id
      ? data
      : null;
  } catch {
    return reviewedCoin(id);
  }
}
export async function resolveResearch(
  provider: ProviderResult,
  take: string,
  id: string,
  lookup: (id: string) => Promise<CoinMetadata | null>,
  now = Date.now(),
): Promise<{ thesis: Thesis | null; research: AIResearch }> {
  const { report, sources, model } = provider;
  const research: AIResearch = {
    take,
    model,
    generatedAt: now,
    allocationRationale: report.allocation_rationale,
    notes: report.evidence_note,
    sources,
    watchlist: [],
    products: report.products
      .filter(
        (p) =>
          sourceObserved(p.source_url, sources) &&
          sameProject(p.url, p.source_url),
      )
      .map((p) => ({
        name: p.name,
        url: p.url,
        type: p.type,
        description: p.description,
        tokenNote: p.token_note,
      })),
  };
  const tokens: Record<string, Token> = {};
  let allocations: { symbol: string; weight: number }[] = [];
  const stablecoins = wantsStablecoins(take);
  let removedWeight = stablecoins ? 0 : report.reserve_weight;
  const seen = new Set<string>();
  const catalogVerified = new Set<string>();
  // Two concurrent metadata reads avoid a burst against the public data API.
  for (let i = 0; i < report.candidates.length; i += 2) {
    const group = report.candidates.slice(i, i + 2);
    const checked = await Promise.all(
      group.map(async (c) => {
        let reason = c.watchlist_reason || "";
        if (!stablecoins && isStablecoin(c.symbol))
          reason = "This stablecoin does not express the thesis. Stablecoins are included only when the take explicitly calls for holding them.";
        if (!sourceObserved(c.source_url, sources))
          reason =
            "The supplied source was not present in the AI’s web research.";
        if (!c.coingecko_id)
          reason = reason || "No unique market-data identity was found.";
        let match: { key: string; token: Token } | null = null;
        if (!reason && c.coingecko_id) {
          const coin = await lookup(c.coingecko_id);
          match = coin ? checkedToken(c, coin) : null;
          if (match && coin?.verification === "reviewed-catalog") catalogVerified.add(c.symbol);
          if (!match)
            reason = coin
              ? "The ticker, project website or token identity could not be matched."
              : "The token-data service could not verify this identity. It may be unavailable or rate-limited.";
        }
        return { c, match, reason };
      }),
    );
    for (const { c, match, reason } of checked) {
      if (!match || seen.has(match.key) || c.weight === 0) {
        removedWeight += c.weight;
        research.watchlist.push({
          name: c.name,
          symbol: c.symbol,
          reason:
            reason ||
            (match && seen.has(match.key)
              ? "Duplicate project identity; counted once."
              : "Research candidate, without an allocation."),
          source: sourceObserved(c.source_url, sources)
            ? c.source_url
            : undefined,
        });
        continue;
      }
      seen.add(match.key);
      tokens[match.key] = match.token;
      allocations.push({ symbol: match.key, weight: c.weight });
    }
  }
  if (stablecoins && report.reserve_weight > 0) {
    if (sources.some(source => [TOKENS.USDC.source, "https://www.circle.com/transparency"].some(url => normalizeUrl(url) === normalizeUrl(source.url))))
      allocations.push({symbol: "USDC", weight: report.reserve_weight});
    else {
      removedWeight += report.reserve_weight;
      research.watchlist.push({name: "USDC", symbol: "USDC", reason: "No Circle issuer or reserve source was observed in the research."});
    }
  }
  if (catalogVerified.size) research.notes = [research.notes, `The live token-data service was unavailable. ${[...catalogVerified].join(", ")} identities were matched against the app’s reviewed project catalog and the sources found in this research; they were not freshly verified by CoinGecko.`].filter(Boolean).join(" ");
  if (!allocations.length) return { thesis: null, research };
  allocations = fullExposure(allocations);
  if (removedWeight > 0) {
    research.notes = [
      research.notes,
      "Excluded irrelevant or unverified allocations and reweighted the remaining verified holdings to 100%. Review the resulting concentration.",
    ]
      .filter(Boolean)
      .join(" ");
    research.allocationRationale = "The final weights preserve relative exposure across the verified thesis holdings. No default stablecoin reserve is added.";
  }
  const thesis: Thesis = {
    id,
    title: report.title,
    body: take,
    summary: report.summary,
    category: report.category,
    author: "You",
    createdAt: now,
    version: 1,
    engine: "ai",
    risk: report.risk,
    evidenceNote: research.notes.slice(0, 600),
    allocations,
    tokens,
    research,
    generationId: id,
  };
  if (report.evidence)
    research.evidence = {
      id,
      thesisId: id,
      fingerprint: await evidenceFingerprint(thesis),
      take,
      generatedAt: now,
      basis: "ai",
      model,
      ...verifiedEvidence(report.evidence, sources, now),
    };
  return { thesis, research };
}
