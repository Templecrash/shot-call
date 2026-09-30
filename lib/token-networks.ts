import type { Token } from "./data";

type NetworkInfo = { names: string[]; source?: string };

// Token identity networks, not a promise of wallet routing or trading support.
// Exact catalog IDs avoid assigning a network to an unrelated ticker match.
const CATALOG_NETWORKS: Record<string, NetworkInfo> = {
  starknet: { names: ['Ethereum', 'Starknet'], source: 'https://www.starknet.io/faqs/' },
  "akash-network": { names: ["Akash"] },
  aethir: { names: ["Ethereum", "Arbitrum", "Solana"], source: "https://docs.aethir.com/aethir-tokenomics/token-overview" },
  "io-net": { names: ["Solana"], source: "https://io.net/blog/io-net-on-solana-the-place-for-depin-in-2026-and-beyond" },
  "golem-network-tokens": { names: ["Ethereum", "Polygon"], source: "https://docs.golem.network/docs/golem/overview/testnet-mainnet" },
  "virtual-protocol": { names: ["Base", "Ethereum", "Solana"], source: "https://whitepaper.virtuals.io/about-virtuals-1/usdvirtual-tokenomics" },
  gala: { names: ["GalaChain", "Ethereum"], source: "https://support.gala.com/hc/en-us/articles/23689188433819-GalaChain" },
  "the-sandbox": { names: ["Ethereum", "Polygon"], source: "https://docs.sandbox.game/en/owners/sand/faqs-sand" },
  decentraland: { names: ["Ethereum", "Polygon"], source: "https://docs.decentraland.org/marketplace/marketplace" },
  "enjin-coin": { names: ["Enjin Blockchain"], source: "https://docs.enjin.io/enjin-products/enjin-coin" },
  "collector-crypt": { names: ["Solana"], source: "https://docs.collectorcrypt.com/cards-token" },
  "fake-world-assets": { names: ["Ethereum"], source: "https://www.fwa.fun/docs/fwa" },
  monero: { names: ["Monero"] },
  zcash: { names: ["Zcash"] },
  solana: { names: ["Solana"] },
  pump: { names: ["Solana"] },
  polkastarter: { names: ["Base", "Ethereum"], source: "https://polkastarter.com/blog/pols-bsc-to-base-migration" },
  "dao-maker": { names: ["Ethereum"] },
  "injective-protocol": { names: ["Injective"] },
  aavegotchi: { names: ["Base", "Ethereum", "Polygon"], source: "https://docs.aavegotchi.com/own/tokens/ghst-token" },
  "immutable-x": { names: ["Ethereum", "Immutable"] },
  ronin: { names: ["Ronin"] },
  "axie-infinity": { names: ["Ethereum", "Ronin"], source: "https://blog.axieinfinity.com/p/migration" },
  "usd-coin": { names: ["Base", "Ethereum", "Arbitrum", "Optimism", "Polygon", "Avalanche", "Solana"], source: "https://developers.circle.com/stablecoins/usdc-contract-addresses" },
  "render-token": { names: ["Solana"], source: "https://know.rendernetwork.com/general-render-network/rndr-to-render-what-you-need-to-know/render-network-upgrade-portal-faq" },
  bittensor: { names: ["Bittensor"] },
  near: { names: ["NEAR"] },
  chainlink: { names: ["Ethereum"] },
  "ondo-finance": { names: ["Ethereum"] },
  ethereum: { names: ["Ethereum"] },
  bitcoin: { names: ["Bitcoin"] },
};

const NETWORK_NAMES: Record<string, string> = {
  megaeth: 'MegaETH',
  ethereum: "Ethereum", solana: "Solana", base: "Base", polygon: "Polygon",
  "polygon-pos": "Polygon", "arbitrum-one": "Arbitrum", arbitrum: "Arbitrum",
  "optimistic-ethereum": "Optimism", optimism: "Optimism",
  "binance-smart-chain": "BNB Chain", "avalanche": "Avalanche",
  "avalanche-c-chain": "Avalanche", "near-protocol": "NEAR", near: "NEAR",
  peaq: "peaq", "ronin": "Ronin", "sui": "Sui", "aptos": "Aptos",
};

// Network logos already used by the wallet, plus native-chain project logos.
const NETWORK_ICONS: Record<string, string> = {
  MegaETH: '/coins/MEGA.png',
  Ethereum: "/networks/ethereum.png", Base: "/networks/base.png",
  Solana: "/networks/solana.png", Arbitrum: "/networks/arbitrum.png",
  Optimism: "/networks/optimism.png", Polygon: "/networks/polygon.png",
  Avalanche: "/networks/avalanchec.png", "BNB Chain": "/networks/smartchain.png",
  Bitcoin: "/coins/BTC-v2.png", Akash: "/coins/AKT-v2.png",
  "Enjin Blockchain": "/coins/ENJ-v2.png", Monero: "/coins/XMR-v2.png",
  Zcash: "/coins/ZEC-v2.png", Injective: "/coins/INJ-v2.png",
  Bittensor: "/coins/TAO-v2.png", NEAR: "/coins/NEAR-v2.png",
  Ronin: "/coins/RON-v2.png", peaq: "/coins/PEAQ.png",
};

export function networkIcon(name: string): string | undefined {
  return NETWORK_ICONS[name];
}

export function tokenNetworks(token: Token): NetworkInfo {
  const id = token.coingeckoId || token.icon;
  const chain = token.chain?.trim();
  if (chain) {
    const name = NETWORK_NAMES[chain.toLowerCase()] || chain.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    return { names: [name], source: token.identitySource || token.source };
  }
  const known = CATALOG_NETWORKS[id];
  return known ? { ...known, source: known.source || token.source } : { names: [] };
}

export function networkLabel(token: Token): string {
  const { names } = tokenNetworks(token);
  if (!names.length) return "Not verified";
  if (names.length > 1 && (token.coingeckoId || token.icon) === "usd-coin") return "Multi-chain";
  return names.length > 1 ? `${names[0]} +${names.length - 1}` : names[0];
}
