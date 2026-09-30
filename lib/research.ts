import { TOKENS, type Thesis } from "./data";
import {wantsStablecoins} from "./allocations";
import {tokenFor} from "./token-catalog";
import {isVitalikPortfolio,VITALIK_PRODUCTS} from './vitalik-portfolio';

export const RESEARCH_DATE = "September 29, 2026";
export type FitKind =
  | "Direct"
  | "Platform"
  | "Adjacent"
  | "Infrastructure"
  | "Reserve"
  | "Unmatched";
type Fit = { kind: FitKind; label: string; reason: string };
type Topic =
  | "Vitalik portfolio"
  | "Geopolitics & oil"
  | "Cards & repacks"
  | "Robotics"
  | "Gacha & collectibles"
  | "Gaming"
  | "Privacy"
  | "Majors"
  | "Ethereum"
  | "Launchpads"
  | "Stock tokens"
  | "AI & compute"
  | "Real-world assets"
  | "Macro"
  | "Stables";

// Gacha baskets are assessed against their product topic.
export function researchTopic(
  thesis: Pick<Thesis, "id" | "category" | "body"> & Partial<Pick<Thesis,"parent">>,
): string {
  if(isVitalikPortfolio(thesis))return 'Vitalik portfolio';
  if (
    thesis.id === "gacha-supercycle" ||
    (thesis.category === "Gaming" && /\bg(?:a|o)t?chas?\b/i.test(thesis.body))
  )
    return "Gacha & collectibles";
  return thesis.category;
}

const FITS: Record<Topic, Partial<Record<string, [FitKind, string]>>> = {
  "Vitalik portfolio": {
    STRK: ["Platform", "StarkWare-backed network"],
    MEGA: ["Platform", "Documented seed investment"],
    AZTEC: ["Platform", "Documented Series A investment"],
  },
  "Geopolitics & oil": {
    BNOON: ["Direct", "Brent-linked fund · paper SHORT"],
    USOON: ["Direct", "WTI-linked fund · paper SHORT"],
    HORMUZYES: ["Direct", "Polymarket YES · November 30"],
  },
  "Cards & repacks": {
    CARDS: ["Direct", "Physical-card repacks"],
    FWA: ["Direct", "Digital NFT repacks · not Pokémon"],
  },
  Robotics: {
    ROBO: ["Direct", "Robot coordination & payments"],
    PEAQ: ["Infrastructure", "Machine identity & economic rails"],
    AUKI: ["Infrastructure", "Spatial perception"],
    GEOD: ["Infrastructure", "Precision navigation"],
  },
  "Gacha & collectibles": {
    CARDS: ["Direct", "Physical-card pulls"],
    FWA: ["Direct", "Digital NFT pools"],
    GHST: ["Adjacent", "Collectible gaming"],
    AXS: ["Adjacent", "Collectible gaming"],
    IMX: ["Infrastructure", "Gaming infrastructure"],
    RON: ["Infrastructure", "Gaming network"],
    SOL: ["Infrastructure", "General-purpose chain"],
    ETH: ["Infrastructure", "General-purpose chain"],
  },
  Gaming: {
    BEAM: ["Infrastructure", "Gaming network"],
    ILV: ["Direct", "Game ecosystem"],
    GALA: ["Platform", "Game ecosystem"],
    SAND: ["Direct", "Creator-made game worlds"],
    MANA: ["Adjacent", "Virtual-world economy"],
    ENJ: ["Infrastructure", "Collectible-asset network"],
    ATH: ["Infrastructure", "Cloud-gaming compute"],
    GHST: ["Direct", "Collectible-game economy"],
    AXS: ["Direct", "Collectible-game economy"],
    IMX: ["Infrastructure", "Gaming infrastructure"],
    RON: ["Infrastructure", "Gaming network"],
    CARDS: ["Adjacent", "Physical-card collecting"],
    FWA: ["Adjacent", "NFT-pool collecting"],
  },
  Privacy: {
    XMR: ["Direct", "Privacy by default"],
    ZEC: ["Direct", "Shielded payments"],
  },
  Majors: {
    BTC: ["Direct", "Major network asset"],
    ETH: ["Direct", "Major network asset"],
    SOL: ["Direct", "Major network asset"],
  },
  Ethereum: {
    ETH: ["Direct", "The thesis asset"],
    LINK: ["Infrastructure", "Oracle network"],
  },
  Launchpads: {
    PUMP: ["Direct", "Token launch platform"],
    POLS: ["Direct", "Launch access"],
    DAO: ["Direct", "Launchpad staking"],
  },
  "Stock tokens": {
    ONDO: ["Platform", "Governance proxy"],
    INJ: ["Infrastructure", "Financial network"],
    LINK: ["Infrastructure", "Data & interoperability"],
    SOL: ["Infrastructure", "Settlement network"],
    ETH: ["Infrastructure", "Settlement network"],
  },
  "AI & compute": {
    AKT: ["Infrastructure", "Decentralized cloud"],
    ATH: ["Infrastructure", "GPU cloud"],
    IO: ["Infrastructure", "Distributed GPUs"],
    GLM: ["Infrastructure", "Compute marketplace"],
    VIRTUAL: ["Platform", "AI-agent economy"],
    TAO: ["Direct", "Machine intelligence"],
    RENDER: ["Adjacent", "GPU rendering"],
    NEAR: ["Infrastructure", "AI application network"],
    LINK: ["Infrastructure", "General data network"],
  },
  "Real-world assets": {
    ONDO: ["Platform", "Governance proxy"],
    LINK: ["Infrastructure", "Data & interoperability"],
    ETH: ["Infrastructure", "Settlement network"],
    INJ: ["Infrastructure", "Financial network"],
  },
  Stables: {USDC: ["Direct", "Dollar stablecoin"]},
  Macro: {
    BTC: ["Direct", "Digital scarcity"],
    ETH: ["Adjacent", "Open settlement"],
  },
};

export function tokenFit(
  thesis: Pick<Thesis, "id" | "category" | "body" | "tokens" | "research"> & Partial<Pick<Thesis,"allocations"|"counter"|"parent">>,
  symbol: string,
): Fit {
  const token = tokenFor(thesis,symbol);
  const counterRoute=thesis.counter?.plan?.routes.find(route=>route.allocation.symbol===symbol);
  if(counterRoute)return {kind:counterRoute.kind==='alternative'?'Adjacent':'Direct',label:counterRoute.kind==='alternative'?'Broader alternative':counterRoute.kind==='outcome'?'Opposite outcome':'Direct counter',reason:counterRoute.reason};
  if(thesis.counter&&symbol!=='USDC'){
    const short=thesis.allocations?.find(a=>a.symbol===symbol)?.side==='short';
    const direction=token.instrument==='prediction'?(short?'NO':'YES'):(short?'SHORT':'LONG');
    return {kind:'Direct',label:`${direction} · reversed from original`,reason:token.instrument==='prediction'?`Illustrative ${direction} exposure to the same event as “${thesis.counter.sourceTitle}”. The external market’s rules apply; event shares are not automatically settled in this demo.`:`${direction} ${token.symbol} reverses the original position in “${thesis.counter.sourceTitle}”. This simulated position benefits when ${token.name} ${short?'falls':'rises'}.`};
  }
  if(thesis.research&&symbol!=='USDC'){
    if(thesis.body!==thesis.research.take)return {kind:'Unmatched',label:'Take changed · refresh research',reason:'This thesis was edited after the AI research. Refresh research to reassess the token fit.'};
    if(thesis.tokens?.[symbol]?.kind)return {kind:thesis.tokens[symbol].kind!,label:thesis.tokens[symbol].fit,reason:thesis.tokens[symbol].reason};
  }
  if (symbol === "USDC")
    return wantsStablecoins(thesis.body)
      ? {kind: "Direct", label: "Dollar stablecoin", reason: token.reason}
      : {kind: "Unmatched", label: "Outside this thesis", reason: "USDC does not express this exposure thesis. Stablecoins belong in a take that explicitly calls for holding them."};
  const topic = researchTopic(thesis);
  const match = FITS[topic as Topic]?.[symbol];
  if (!match)
    return {
      kind: "Unmatched",
      label: "Fit not established",
      reason: `We have not established a specific link between ${token?.name || symbol} and this thesis. ${token?.reason || "Review its identity and product before adding it."}`,
    };
  const [kind, rawLabel] = match;
  const label=token.instrument==='stock'?rawLabel.replace('paper SHORT',thesis.allocations?.find(a=>a.symbol===symbol)?.side==='short'?'paper SHORT':'paper LONG'):rawLabel;
  let reason = token.reason;
  if (
    topic === "Gacha & collectibles" &&
    ["GHST", "AXS", "IMX", "RON", "SOL", "ETH"].includes(symbol)
  )
    reason = `${token.name} is ${kind === "Adjacent" ? "adjacent collectible-game exposure" : "broader infrastructure"}, not a verified gacha-platform token. ${reason}`;
  if (topic === "AI & compute" && symbol === "LINK")
    reason = `Chainlink is general oracle infrastructure. The connection to AI is indirect; it is not an AI model or GPU-compute token. ${reason}`;
  if (topic === "Stock tokens" && symbol === "ONDO")
    reason = `ONDO is a governance proxy for the Ondo ecosystem, not a tokenized stock or an equity claim on Ondo. ${reason}`;
  return { kind, label, reason };
}

export type Candidate = {
  id: string;
  name: string;
  symbol: string;
  kind: Exclude<FitKind, "Reserve" | "Unmatched" | "Platform">;
  status:
    | "Identity checked"
    | "Documented token"
    | "Migration"
    | "Identity pending"
    | "Planned product";
  chain: string;
  address?: string;
  explorer?: string;
  description: string;
  source: string;
  basketSymbol?: string;
  image?: string;
};
// Project IDs are intentional: unrelated projects can use the same ticker.
// Identity checked means the primary source identifies the token, not that it is safe to trade.
export const GACHA_CANDIDATES: Candidate[] = [
  {
    id: "collector-crypt",
    name: "Collector Crypt",
    symbol: "CARDS",
    kind: "Direct",
    status: "Identity checked",
    chain: "Solana",
    address: "CARDSccUMFKoPRZxt5vt3ksUbxEFEcnZ3H2pd3dKxYjp",
    explorer:
      "https://solscan.io/token/CARDSccUMFKoPRZxt5vt3ksUbxEFEcnZ3H2pd3dKxYjp",
    description:
      "Graded physical-card pulls and a redeemable-card marketplace. CARDS is the documented ecosystem token. Paper baskets only here.",
    source: "https://docs.collectorcrypt.com/cards-token",
    basketSymbol: "CARDS",
  },
  {
    id: "fake-world-assets",
    name: "Fake World Assets",
    symbol: "FWA",
    kind: "Direct",
    status: "Identity checked",
    chain: "Ethereum",
    address: "0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845",
    explorer:
      "https://etherscan.io/token/0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845",
    description:
      "Random draws from digital NFT pools. Special token-transfer and market rules require a separate integration. Paper baskets only here.",
    source: "https://www.fwa.fun/docs/deployments",
    basketSymbol: "FWA",
  },
  {
    id: "powergacha",
    image: "/coins/powergacha.svg",
    name: "PowerGacha",
    symbol: "GACHA",
    kind: "Direct",
    status: "Migration",
    chain: "Solana",
    description:
      "Card games, packs and slab upgrades. The official migration page says the new mint will be published at launch. Excluded from allocations until the new identity is checked.",
    source: "https://powergacha.io/migrate",
  },
  {
    id: "gacha-fund",
    image: "/coins/gacha-fund.png",
    name: "Gacha Fund",
    symbol: "GACHA",
    kind: "Direct",
    status: "Identity pending",
    chain: "Chain / contract unverified",
    description:
      "Seat fees fund card pulls; the project describes card-sale proceeds buying and burning its token. This is a different GACHA from PowerGacha. Contract not verified.",
    source: "https://gacha.fund/how",
  },
  {
    id: "bye-fun",
    image: "/coins/bye-fun.png",
    name: "bye.fun",
    symbol: "BYE",
    kind: "Direct",
    status: "Identity pending",
    chain: "Solana · mint unverified",
    description:
      "Crowd-owned gacha and tokenized cards. The site describes BYE rewards, but a canonical mint was not verified in this review.",
    source: "https://bye.fun/",
  },
  {
    id: "cardx",
    image: "/coins/cardx.svg",
    name: "CardX",
    symbol: "CX",
    kind: "Direct",
    status: "Identity pending",
    chain: "Chain / contract unverified",
    description:
      "A card-collecting and gacha platform describing CX rewards and governance. Token identity and current availability need verification.",
    source: "https://cardx.fun/",
  },
  {
    id: "the-card-wall",
    image: "/coins/the-card-wall.png",
    name: "TheCardWall",
    symbol: "WALL",
    kind: "Direct",
    status: "Planned product",
    chain: "Chain / contract unverified",
    description:
      "Membership ecosystem with a planned gacha using Collector Crypt inventory. The whitepaper leaves activation and final terms pending.",
    source: "https://thecardwall.com/whitepaper",
  },
  {
    id: "gacha-galaxy",
    image: "/coins/gacha-galaxy.png",
    name: "Gacha Galaxy",
    symbol: "GG",
    kind: "Infrastructure",
    status: "Identity pending",
    chain: "Chain / contract unverified",
    description:
      "Collectible pricing and data infrastructure, rather than a pull machine. The site describes GG utility; GG Points are not the token. Contract not verified.",
    source: "https://www.gachagalaxy.io/",
  },
  ...(["GHST", "AXS", "IMX", "RON"] as const).map((symbol) => ({
    id: TOKENS[symbol].icon,
    name: TOKENS[symbol].name,
    symbol,
    kind: (symbol === "GHST" || symbol === "AXS"
      ? "Adjacent"
      : "Infrastructure") as Candidate["kind"],
    status: "Documented token" as const,
    chain: "See project documentation",
    description: tokenFit(
      { id: "gacha-collectibles", category: "Gacha & collectibles", body: "" },
      symbol,
    ).reason,
    source: TOKENS[symbol].source,
    basketSymbol: symbol,
  })),
];

export type EcosystemProduct = {
  name: string;
  url: string;
  type: string;
  description: string;
  tokenNote: string;
  symbol?: string;
};
const product = (
  name: string,
  url: string,
  type: string,
  description: string,
  tokenNote: string,
  symbol?: string,
): EcosystemProduct => ({ name, url, type, description, tokenNote, symbol });
const collector = product(
  "Collector Crypt",
  "https://gacha.collectorcrypt.com/",
  "Physical cards",
  "Pull graded cards, trade their NFTs, or redeem the physical collectible.",
  "CARDS · ecosystem token",
  "CARDS",
);
const fwa = product(
  "Fake World Assets",
  "https://www.fwa.fun/",
  "Digital collectibles",
  "Explore pooled NFTs and randomized draws.",
  "FWA · protocol token",
  "FWA",
);
const uniswap = product(
  "Uniswap",
  "https://app.uniswap.org/",
  "Trading",
  "Explore onchain token swaps and liquidity pools.",
  "Product link · not an allocation",
);
const aave = product(
  "Aave",
  "https://app.aave.com/",
  "Lending",
  "Explore markets for supplying and borrowing crypto assets.",
  "Product link · not an allocation",
);
const ondo = product(
  "Ondo Global Markets",
  "https://ondo.finance/global-markets",
  "Tokenized securities",
  "Explore Ondo’s tokenized securities offering and product eligibility.",
  "ONDO is governance, not a stock",
  "ONDO",
);
export const GACHA_PRODUCTS: EcosystemProduct[] = [
  collector,
  product(
    "PowerGacha",
    "https://powergacha.io/",
    "Physical cards",
    "Card packs, slab upgrades and games built around collectible inventory.",
    "GACHA · migration watchlist",
  ),
  product(
    "Courtyard",
    "https://courtyard.io/",
    "Physical cards",
    "Digital packs and a marketplace for vaulted physical collectibles.",
    "Platform token not verified",
  ),
  product(
    "Phygitals",
    "https://www.phygitals.com/",
    "Physical cards",
    "Open graded-card packs; hold, trade or redeem the physical card.",
    "Platform token not verified",
  ),
  product(
    "Beezie",
    "https://beezie.com/",
    "Physical cards",
    "Claw pulls, a collectibles marketplace and physical redemption.",
    "Platform token not verified",
  ),
  fwa,
  product(
    "Rips",
    "https://rips.cards/",
    "Physical cards",
    "A Solana card-gacha product using Collector Crypt inventory and Arcium.",
    "Platform token not verified",
  ),
  product(
    "OpenGacha",
    "https://www.opengacha.io/",
    "Gacha shops",
    "Explore onchain pull shops for NFTs and graded cards.",
    "Platform token not verified",
  ),
  product(
    "Artifacte",
    "https://artifacte.io/",
    "Marketplace",
    "Graded cards, sealed packs, gacha and collectible redemption.",
    "Platform token not verified",
  ),
  product(
    "Collectr",
    "https://www.collectr.gg/",
    "Launch platform",
    "Creator-token launches linked to Collector Crypt card pulls.",
    "Individual launch tokens vary",
  ),
  product(
    "Gacha Fund",
    "https://gacha.fund/how",
    "Card-pull funding",
    "Explore the project’s seat-funded card-pull and token mechanics.",
    "GACHA · identity pending",
  ),
  product(
    "bye.fun",
    "https://bye.fun/",
    "Physical cards",
    "A crowd-owned gacha platform for tokenized card collecting.",
    "BYE · identity pending",
  ),
  product(
    "CardX",
    "https://cardx.fun/",
    "Card collecting",
    "Explore its gacha, card-collecting and reward-token model.",
    "CX · identity pending",
  ),
  product(
    "Gacha Galaxy",
    "https://www.gachagalaxy.io/",
    "Data & pricing",
    "Collectible pricing tools and data infrastructure for the category.",
    "GG · identity pending",
  ),
  product(
    "TheCardWall",
    "https://thecardwall.com/whitepaper",
    "Planned gacha",
    "Read the membership ecosystem’s proposed graded-card gacha model.",
    "WALL · planned product",
  ),
  product(
    "GachaPad",
    "https://gachapad.com/",
    "Testnet",
    "A gacha-style token distribution experiment on Base Sepolia.",
    "Testnet · not a mainnet investment",
  ),
];
const PRODUCTS: Record<Topic, EcosystemProduct[]> = {
  "Vitalik portfolio": VITALIK_PRODUCTS,
  Stables: [
    product("Circle USDC", "https://www.circle.com/usdc", "Stablecoin issuer", "Explore the issuer's description of its dollar-denominated stablecoin.", "USDC · Dollar stablecoin"),
    product("Circle transparency", "https://www.circle.com/transparency", "Reserve disclosures", "Review Circle's reserve disclosures and published attestations.", "Issuer information · No additional token"),
  ],
  "Geopolitics & oil": [
    product('Ondo BNOon','https://app.ondo.finance/assets/bnoon','Tokenized oil fund','Brent-linked ETF token. Buying the token is long exposure; this thesis models a separate paper short.','BNOon · paper SHORT','BNOON'),
    product('Ondo USOon','https://app.ondo.finance/assets/usoon','Tokenized oil fund','WTI-linked ETF token. No live borrow or short execution is connected in Shot Call.','USOon · paper SHORT','USOON'),
    product('Polymarket · Hormuz YES','https://polymarket.com/event/strait-of-hormuz-traffic-returns-to-normal-by-november-30-20260810151158765','Event contract','Normal Hormuz traffic by November 30. Read the threshold, deadline and resolution rules before selecting YES.','YES outcome shares · external market','HORMUZYES'),
    product('IMF PortWatch','https://portwatch.imf.org/pages/cb5856222a5b4105adc6ee7e880a1730','Settlement data','The transit data named in the Polymarket rules. A political announcement is not the settlement trigger.','Data source · not an allocation'),
    product('USCF Oil Funds','https://www.uscfinvestments.com/uso','Underlying funds','Review USO’s futures exposure and tracking mechanics; BNO has a separate Brent-linked mandate.','Underlying fund information'),
  ],
  "Cards & repacks": [
    collector,
    product("Courtyard", "https://courtyard.io/", "Vaulted cards", "Digital packs, a card marketplace and physical vaulting with redemption.", "Platform token not verified"),
    product("Phygitals", "https://www.phygitals.com/", "Pokémon repacks", "Pokémon collecting, digital packs, user-created repacks and physical-card vaulting.", "Platform token not verified"),
    product("Beezie", "https://beezie.com/", "Collectible pulls", "Onchain collectible pulls and physical-card vaulting.", "Platform token not verified"),
    fwa,
    product("Trove", "https://trove.xyz/", "Digital repacks", "Repacks containing physical Pokémon and sports cards, with published odds and sellback options.", "Blockchain & platform token not verified"),
    product("PowerGacha", "https://powergacha.io/migrate", "Card pulls", "Card pulls using CollectorCrypt inventory. Review its current token migration before considering exposure.", "GACHA · migration watchlist"),
  ],
  Robotics: [
    product("Fabric Robopay", "https://robopay.fabric.foundation/", "Robot payments", "Payment and coordination infrastructure for robots and their operators.", "ROBO · protocol token", "ROBO"),
    product("peaq Machine Economy", "https://machines.peaq.xyz/economics", "Machine infrastructure", "Explore machine identity, network participation and machine activation bonds.", "PEAQ · network token", "PEAQ"),
    product("Auki posemesh", "https://www.auki.com/", "Spatial intelligence", "Shared spatial perception for robots, devices and real-world environments.", "AUKI · network access", "AUKI"),
    product("GEODNET", "https://www.geodnet.com/product", "Precise positioning", "RTK positioning infrastructure for outdoor autonomy, robots and drones.", "GEOD · coverage incentives", "GEOD"),
    product("OpenMind", "https://openmind.com/", "Robot software", "OM1 is an operating system for robots. Explore its software and documentation.", "OM1 is software · no token verified"),
    product("Robonomics", "https://robonomics.app/", "Connected machines", "Explore robot and connected-device tools; review XRT’s production-stage token migration.", "XRT · migration & liquidity watchlist"),
  ],
  "Gacha & collectibles": GACHA_PRODUCTS,
  Gaming: [
    product(
      "Aavegotchi",
      "https://www.aavegotchi.com/",
      "Collectible game",
      "Explore collectible characters and the Aavegotchi ecosystem.",
      "GHST · game ecosystem",
      "GHST",
    ),
    product(
      "Axie Infinity",
      "https://axieinfinity.com/",
      "Collectible game",
      "A game ecosystem built around collectible creatures.",
      "AXS · governance token",
      "AXS",
    ),
    product(
      "Immutable",
      "https://www.immutable.com/",
      "Gaming platform",
      "Explore games and digital ownership infrastructure.",
      "IMX · infrastructure token",
      "IMX",
    ),
    product(
      "Ronin",
      "https://www.roninchain.com/",
      "Gaming network",
      "Discover games building on the Ronin network.",
      "RON · network token",
      "RON",
    ),
  ],
  Privacy: [
    product(
      "Monero wallets",
      "https://www.getmonero.org/downloads/",
      "Private payments",
      "Official wallet downloads for the Monero network.",
      "XMR · network asset",
      "XMR",
    ),
    product(
      "Zcash",
      "https://z.cash/",
      "Shielded payments",
      "Explore shielded payments, wallets and the Zcash ecosystem.",
      "ZEC · network asset",
      "ZEC",
    ),
  ],
  Majors: [
    uniswap,
    aave,
    product(
      "Jupiter",
      "https://jup.ag/",
      "Solana markets",
      "Explore trading and financial applications on Solana.",
      "SOL is network exposure",
      "SOL",
    ),
  ],
  Ethereum: [
    uniswap,
    aave,
    product(
      "Lido",
      "https://lido.fi/",
      "ETH staking",
      "Explore liquid ETH staking and how stETH works.",
      "ETH, stETH and LDO have different roles",
      "ETH",
    ),
  ],
  Launchpads: [
    product(
      "Pump.fun",
      "https://pump.fun/",
      "Token launches",
      "Create and discover newly launched tokens.",
      "PUMP · platform token",
      "PUMP",
    ),
    product(
      "Polkastarter",
      "https://polkastarter.com/",
      "Token launches",
      "Explore project launches and participation requirements.",
      "POLS · launch access",
      "POLS",
    ),
    product(
      "DAO Maker",
      "https://daomaker.com/",
      "Token launches",
      "Explore fundraising products and staking-based participation.",
      "DAO · launchpad token",
      "DAO",
    ),
  ],
  "Stock tokens": [
    ondo,
    product(
      "xStocks",
      "https://xstocks.com/",
      "Tokenized securities",
      "Explore equity-linked tokens and their terms of access.",
      "Product tokens are not platform equity",
    ),
    product(
      "Injective",
      "https://injective.com/solutions/tokenization",
      "Financial infrastructure",
      "Explore infrastructure for tokenization and financial markets.",
      "INJ · network token",
      "INJ",
    ),
  ],
  "AI & compute": [
    product(
      "Bittensor",
      "https://www.bittensor.com/",
      "Machine intelligence",
      "Explore the decentralized machine-intelligence network.",
      "TAO · network incentives",
      "TAO",
    ),
    product(
      "Render Network",
      "https://rendernetwork.com/",
      "GPU rendering",
      "Distributed GPU rendering for digital creation.",
      "RENDER · rendering network",
      "RENDER",
    ),
    product(
      "NEAR AI",
      "https://near.ai/",
      "AI applications",
      "Explore confidential AI inference and application infrastructure.",
      "NEAR is indirect network exposure",
      "NEAR",
    ),
  ],
  "Real-world assets": [
    ondo,
    product(
      "Centrifuge",
      "https://centrifuge.io/",
      "Asset management",
      "Infrastructure for bringing investment products onchain.",
      "Product link · not an allocation",
    ),
    product(
      "Chainlink",
      "https://chain.link/",
      "Data & interoperability",
      "Oracle and interoperability services for onchain financial applications.",
      "LINK · infrastructure token",
      "LINK",
    ),
  ],
  Macro: [
    product(
      "Bitcoin",
      "https://bitcoin.org/",
      "Monetary network",
      "Explore Bitcoin, its software and wallet ecosystem.",
      "BTC · network asset",
      "BTC",
    ),
    product(
      "Ethereum",
      "https://ethereum.org/",
      "Open settlement",
      "Explore the Ethereum network and its applications.",
      "ETH · network asset",
      "ETH",
    ),
  ],
};
export function ecosystemProducts(
  thesis: Pick<Thesis, "id" | "category" | "body" | "research"> & Partial<Pick<Thesis,"parent">>,
): EcosystemProduct[] {
  return thesis.research?.products ?? PRODUCTS[researchTopic(thesis) as Topic] ?? [];
}
