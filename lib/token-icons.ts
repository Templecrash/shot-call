import { TOKENS, type Token } from "./data";
import { COIN_IDS } from "./coin-chart";

const ICON_FILES: Record<string, string> = {
  BEAM: "BEAM.png",
  ILV: "ILV.png",
  "LINK": "LINK-v2.png",
  "RENDER": "RENDER-v2.png",
  "ENJ": "ENJ-v2.png",
  "ONDO": "ONDO-v2.png",
  "AXS": "AXS-v2.png",
  "IMX": "IMX-v2.png",
  "INJ": "INJ-v2.png",
  "DAO": "DAO-v2.png",
  "RON": "RON-v2.png",
  "TAO": "TAO-v2.png",
  "VIRTUAL": "VIRTUAL-v2.png",
  "MANA": "MANA-v2.png",
  "SAND": "SAND-v2.png",
  "GALA": "GALA-v2.png",
  "GHST": "GHST-v2.png",
  "AKT": "AKT-v2.png",
  "ATH": "ATH-v2.png",
  "IO": "IO-v2.png",
  "NEAR": "NEAR-v2.png",
  "PUMP": "PUMP-v2.png",
  "POLS": "POLS-v2.png",
  "GLM": "GLM-v2.png",
  "BTC": "BTC-v2.png",
  "ETH": "ETH-v2.png",
  "SOL": "SOL-v2.png",
  "XMR": "XMR-v2.png",
  "ZEC": "ZEC-v2.png",
  "USDC": "USDC-v2.png",
  "CARDS": "CARDS.png",
  "FWA": "FWA-v2.png"
};
const localById = new Map<string, string>();
for (const [key, id] of Object.entries(COIN_IDS)) {
  const path = `/coins/${ICON_FILES[key] || `${key}.png`}`;
  localById.set(id, path);
  // Preserve older saved metadata while using the same checked project logo.
  if (TOKENS[key]?.icon) localById.set(TOKENS[key].icon, path);
}

export function safeRemoteIcon(value?: string): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["assets.coingecko.com", "coin-images.coingecko.com", "s2.coinmarketcap.com"].includes(url.hostname)
      ? url.href : null;
  } catch { return null; }
}

export function tokenIconSources(token: Token, key: string): string[] {
  const id = token.coingeckoId || token.icon || (key.startsWith("cg:") ? key.slice(3) : "");
  const sources: string[] = [];
  const local = localById.get(id);
  if (local) sources.push(local);
  if (!local && token.image && /^\/coins\/[\w-]+\.(?:png|jpe?g|webp|svg)$/.test(token.image)) sources.push(token.image);
  const remote = safeRemoteIcon(token.image);
  if (remote) sources.push(remote);
  const coinId = local ? Object.keys(COIN_IDS).find(k => localById.get(COIN_IDS[k]) === local) : undefined;
  const verifiedId = coinId ? COIN_IDS[coinId] : token.coingeckoId || (key.startsWith("cg:") ? key.slice(3) : "");
  if (verifiedId && /^[a-z0-9][a-z0-9-]{0,100}$/.test(verifiedId)) sources.push(`/api/token-icon?id=${encodeURIComponent(verifiedId)}`);
  return [...new Set(sources)];
}
