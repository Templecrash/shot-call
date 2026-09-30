import type { Token } from "../data";
import type { AICandidate } from "./schema";

// Issuer-owned metadata is an independent identity source when a market-data
// aggregator has no listing or is unavailable. Never fetch a model-supplied URL.
export const ONDO_TOKEN_LIST = "https://raw.githubusercontent.com/ondoprotocol/ondo-global-markets-token-list/main/tokenlist.json";
type IssuerToken = { chainId: number; address: string; name: string; symbol: string; logoURI?: string };
export type StockMatch = { key: string; token: Token };
export type StockLookup = (candidate: AICandidate) => Promise<StockMatch | null>;

export function parseStockCatalog(raw: unknown): IssuerToken[] {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { tokens?: unknown }).tokens)) return [];
  return (raw as { tokens: unknown[] }).tokens.filter((row): row is IssuerToken => {
    if (!row || typeof row !== "object") return false;
    const t = row as IssuerToken;
    return [1, 56].includes(t.chainId) && typeof t.address === "string" && /^0x[0-9a-fA-F]{40}$/.test(t.address)
      && typeof t.symbol === "string" && /^[a-z0-9]{1,18}on$/i.test(t.symbol)
      && typeof t.name === "string" && t.name.length <= 100 && / \(Ondo Tokenized\)$/.test(t.name);
  });
}

function assetSymbol(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "app.ondo.finance" && !u.username && !u.password && !u.port
      ? /^\/assets\/([a-z0-9]+)\/?$/i.exec(u.pathname)?.[1].toLowerCase() || null : null;
  } catch { return null; }
}

export function matchIssuerStock(candidate: AICandidate, catalog: IssuerToken[]): StockMatch | null {
  const symbol = candidate.symbol.toLowerCase();
  // Exact asset pages, not an issuer homepage or ticker alone, establish which
  // security the research refers to. resolveResearch also requires observation.
  if (assetSymbol(candidate.source_url) !== symbol || assetSymbol(candidate.official_url) !== symbol) return null;
  const matches = catalog.filter(t => t.symbol.toLowerCase() === symbol);
  if (!matches.length || new Set(matches.map(t => t.name)).size !== 1) return null;
  const token = matches.find(t => t.chainId === 1) || matches[0];
  const canonicalName = token.name.replace(/ \(Ondo Tokenized\)$/, "");
  const normalizeName = (value: string) => value.toLowerCase().replace(/\(ondo tokenized\)|ondo tokenized(?: stock)?|tokenized stock/g, "").replace(/[^a-z0-9]/g, "");
  if (normalizeName(candidate.name) !== normalizeName(canonicalName)) return null;
  const logo = typeof token.logoURI === "string" && /^https:\/\/cdn\.ondo\.finance\/tokens\/logos\/[a-z0-9_-]+\.png$/i.test(token.logoURI) ? token.logoURI : undefined;
  return {
    key: `issuer:ondo:${symbol}`,
    token: {
      symbol: token.symbol, name: token.name.slice(0, 80), color: "#3159a8", icon: "", image: logo,
      instrument: "stock", fit: "Tokenized stock · Ondo", kind: candidate.exposure,
      reason: candidate.reason,
      risk: `${candidate.risk} Stock-backed economic exposure through Ondo; not direct shareholder ownership. Issuer terms and regional eligibility apply to live access.`,
      source: `https://app.ondo.finance/assets/${symbol}`, identitySource: ONDO_TOKEN_LIST,
      chain: token.chainId === 1 ? "Ethereum" : "BNB Chain", contract: token.address,
    },
  };
}

export function createStockLookup(fetcher: typeof fetch = fetch): StockLookup {
  let catalog: Promise<IssuerToken[]> | undefined;
  return async candidate => {
    if (!assetSymbol(candidate.source_url)) return null;
    catalog ??= (async () => {
      try {
        const response = await fetcher(ONDO_TOKEN_LIST, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
        return response.ok ? parseStockCatalog(await response.json()) : [];
      } catch { return []; }
    })();
    return matchIssuerStock(candidate, await catalog);
  };
}
