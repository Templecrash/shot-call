import { EXAMPLES, type Thesis } from "../data";
import { evidenceFingerprint } from "./core";
import type { EvidenceItem, EvidenceReport } from "./types";
import {VITALIK_CALL_ID,VITALIK_EVIDENCE,VITALIK_REVIEWED_AT} from '../vitalik-portfolio';
const reviewed = Date.parse("2026-09-29T00:00:00Z");
const item = (
  title: string,
  url: string,
  publisher: string,
  publishedAt: string | null,
  stance: EvidenceItem["stance"],
  summary: string,
  relevance: string,
  kind: EvidenceItem["kind"] = "article",
  relationship: EvidenceItem["relationship"] = "project",
  author: string | null = null,
): EvidenceItem => ({
  title,
  url,
  publisher,
  publishedAt,
  stance,
  summary,
  relevance,
  kind,
  relationship,
  author,
});
const gacha: EvidenceItem[] = [
  item(
    "Buyback infrastructure for collectible cards",
    "https://docs.collectorcrypt.com/gacha/cc-buyback",
    "CollectorCrypt",
    null,
    "supports",
    "The documentation describes quote-based buybacks for cards held in program-owned wallets. Execution depends on a valid quote and available payment funds.",
    "A resale route supports the product-usefulness argument. This mechanism does not establish demand for CARDS or a return for token holders.",
    "docs",
  ),
  item(
    "CARDS token transparency",
    "https://collectorcrypt.com/tokenomics",
    "CollectorCrypt",
    "2026-09-04",
    "challenges",
    "The tokenomics page documents team, advisor and seed vesting extending into 2027, alongside supply and burn disclosures.",
    "Scheduled unlocks are a supply risk to weigh against product growth. Any token buybacks should not be treated as guaranteed.",
    "docs",
  ),
  item(
    "A collector’s interest in the Renacrypt pack",
    "https://x.com/Mark_Memelord/status/2032069874177228820",
    "Mark on X",
    "2026-03-12",
    "supports",
    "A collector discusses buying Chinese Pokémon collectibles while sharing a Renaiss and CollectorCrypt gacha-pack restock.",
    "This is one example of collector interest. It is anecdotal and does not demonstrate broad adoption or token value.",
    "social",
    "community",
    "@Mark_Memelord",
  ),
];
const privacy: EvidenceItem[] = [
  item(
    "Shielded ZEC in Brave Wallet",
    "https://electriccoin.co/blog/shielded-zec-in-brave-wallet/",
    "Electric Coin Company",
    "2025-04-02",
    "supports",
    "The Zcash developer announced shielded ZEC support in Brave Wallet, bringing private transactions to another wallet interface.",
    "Wider wallet access supports the adoption premise, without establishing that privacy-coin prices will rise.",
  ),
  item(
    "Support for Monero in Europe",
    "https://support.kraken.com/in/articles/support-for-monero-xmr-in-europe",
    "Kraken",
    "2025-03-31",
    "challenges",
    "Kraken describes its 2024 halt to XMR trading and deposits for EEA clients, followed by the end of withdrawals.",
    "This historical delisting illustrates exchange-access and liquidity risks. It is not a new market-wide ban.",
    "docs",
    "independent",
  ),
  item(
    "Zcash on privacy at the base layer",
    "https://x.com/Zcash/status/1950190119601795176",
    "Zcash on X",
    "2025-07-29",
    "supports",
    "Zcash argues that privacy should be built into the base layer rather than added only at the application layer.",
    "This states the project’s utility argument; it is an issuer perspective, not independent evidence of future demand.",
    "social",
    "project",
    "@Zcash",
  ),
  item(
    "A critique of optional privacy",
    "https://x.com/THORChain/status/1603641988645285889",
    "THORChain on X",
    "2022-12-16",
    "challenges",
    "THORChain contrasts Zcash’s optional privacy with Monero’s approach and argues in favor of Monero.",
    "The historical opinion challenges treating privacy assets as interchangeable. It is not a current audit or a rebuttal of the entire sector.",
    "social",
    "project",
    "@THORChain",
  ),
];
const ethereum: EvidenceItem[] = [
  item(
    "EF Protocol: Current and Emerging Priorities",
    "https://blog.ethereum.org/2026/09/07/protocol-priorities",
    "Ethereum Foundation",
    "2026-09-07",
    "supports",
    "The protocol team sets out work on scaling, privacy, fast finality and longer-term security, with an ambitious upgrade schedule.",
    "Continued engineering work supports a development thesis. A roadmap is neither a completed upgrade nor evidence for a $7,000 price target.",
  ),
  item(
    "Protocol Update 003 — Improve UX",
    "https://blog.ethereum.org/2025/08/29/protocol-update-003",
    "Ethereum Foundation",
    "2025-08-29",
    "challenges",
    "The update discusses fragmentation across the L2 ecosystem and work needed to improve the user experience.",
    "Remaining usability and interoperability work complicates the path from technical progress to adoption.",
  ),
  item(
    "lean Ethereum",
    "https://blog.ethereum.org/2025/07/31/lean-ethereum",
    "Ethereum Foundation",
    "2025-07-31",
    "context",
    "This long-term technical vision discusses a simpler, stronger Ethereum protocol.",
    "It provides technical context, but the original take did not identify a specific Vitalik paper. This source should not be assumed to be that paper.",
  ),
];
const majors: EvidenceItem[] = [
  item(
    "Approval of spot Bitcoin exchange-traded products",
    "https://www.sec.gov/newsroom/speeches-statements/gensler-statement-spot-bitcoin-011023",
    "SEC",
    "2024-01-10",
    "context",
    "The SEC chair explained the approval of spot Bitcoin exchange-traded products while emphasizing that approval was not an endorsement of Bitcoin.",
    "The historical decision is relevant to market access. It provides no evidence that the current market has reached a bottom.",
    "article",
    "regulator",
  ),
  item(
    "The dissent on spot Bitcoin products",
    "https://www.sec.gov/newsroom/speeches-statements/crenshaw-statement-spot-bitcoin-011023",
    "SEC",
    "2024-01-10",
    "challenges",
    "Commissioner Caroline Crenshaw raised market-manipulation and investor-protection concerns in her dissent.",
    "These historical concerns challenge an uncomplicated bull case. They are not a present-day forecast for BTC, ETH or SOL.",
    "article",
    "regulator",
  ),
];
const launchpads: EvidenceItem[] = [
  item(
    "The PUMP token and its mechanics",
    "https://pump.fun/pump-token",
    "Pump.fun",
    null,
    "challenges",
    "The project describes buyback mechanics while stating that the token does not provide a right to revenues or distributions.",
    "Platform activity and token-holder returns are different claims. Token rights matter when assessing whether launchpads are attractive investments.",
    "docs",
  ),
  item(
    "Participating in a Polkastarter IDO",
    "https://blog.polkastarter.com/how-to-participate-in-a-polygon-pool-during-a-polkastarter-ido/",
    "Polkastarter",
    null,
    "supports",
    "The participation guide describes eligibility and the role of POLS holdings or staking in joining token launches.",
    "An access function supports a platform-token utility argument. It does not show that every launch or platform token will perform well.",
  ),
  item(
    "Aether Games private sale on Polkastarter",
    "https://blog.polkastarter.com/aether-games-private-sale-on-polkastarter/",
    "Polkastarter",
    "2024-02-15",
    "context",
    "The historical sale announcement explains a fundraising event with token release and vesting conditions.",
    "Launch terms need individual assessment. A past sale does not justify the claim that launchpads are the only worthwhile investments.",
  ),
];
const stocks: EvidenceItem[] = [
  item(
    "Tokenized equities arrive on Kraken",
    "https://blog.kraken.com/product/xstocks/tokenized-equities-now-available",
    "Kraken",
    "2025-06-30",
    "supports",
    "Kraken announced xStocks for eligible non-US clients, bringing tokenized equity exposure to its platform and Solana.",
    "An actual product rollout supports the distribution thesis. Eligibility restrictions apply, and this is not evidence of value accruing to the basket’s governance tokens.",
  ),
  item(
    "Wall Street, meet DeFi",
    "https://blog.ondo.finance/global-markets/",
    "Ondo Finance",
    null,
    "supports",
    "Ondo sets out its framework for bringing securities onchain through Global Markets.",
    "The proposal supports the product opportunity. It does not give ONDO holders a claim on the underlying securities or their revenues.",
  ),
  item(
    "Enchanting, but Not Magical",
    "https://www.sec.gov/newsroom/speeches-statements/peirce-statement-tokenized-securities-070925",
    "SEC",
    "2025-07-09",
    "challenges",
    "Commissioner Hester Peirce explains that tokenization does not remove securities-law obligations and that token structures can provide different rights.",
    "Legal structure, counterparties and holder rights can constrain the investment case even when the technology gains adoption.",
    "article",
    "regulator",
  ),
  item(
    "Statement on Tokenized Securities",
    "https://www.sec.gov/newsroom/speeches-statements/corp-fin-statement-tokenized-securities-012826-statement-tokenized-securities",
    "SEC",
    "2026-01-28",
    "context",
    "SEC staff distinguish different tokenized-security structures and the rights they may represent.",
    "Useful context for checking what a product actually owns or promises. Infrastructure tokens should not be confused with tokenized shares.",
    "article",
    "regulator",
  ),
];
const pokemonRepacks: EvidenceItem[] = [
  item(
    "Resale infrastructure for vaulted collectible cards",
    "https://docs.collectorcrypt.com/gacha/cc-buyback",
    "CollectorCrypt", null, "supports",
    "CollectorCrypt documents quote-based buybacks for cards held in program-owned wallets, subject to a valid quote and available payment funds.",
    "A resale route supports physical-card repacks as a product. Buying CARDS does not mean owning a vaulted Pokémon card or receiving its resale proceeds.",
    "docs",
  ),
  item(
    "CARDS supply and scheduled unlocks",
    "https://docs.collectorcrypt.com/cards-token",
    "CollectorCrypt", null, "challenges",
    "CollectorCrypt identifies its Solana token and fixed supply, while documenting monthly seed, team and advisor unlocks from August 2026 through July 2027.",
    "Scheduled supply entering circulation can offset growth in card activity. Buyback and burn mechanics do not guarantee token returns.",
    "docs",
  ),
  item(
    "Creating repacks and redeeming physical cards",
    "https://docs.phygitals.com/resources/faq",
    "Phygitals", null, "supports",
    "Phygitals describes user-created packs, crypto payments, vaulted card twins and physical redemption, with Pokémon cards used as an example.",
    "This supports the broader card-repack product category. No Phygitals platform token was verified for this basket, and its activity does not establish demand for CARDS.",
    "docs",
  ),
  item(
    "FWA tokens, digital pools and separate balances",
    "https://www.fwa.fun/docs/fwa",
    "Fake World Assets", null, "context",
    "FWA documents its ecosystem token, ETH/FWA market, NFT wrappers and separate balances for NFT backing, earned ETH and token rewards.",
    "FWA provides digital NFT repack exposure rather than physical Pokémon-card ownership. Its market fees, transfer rules and slippage require separate assessment.",
    "docs",
  ),
];
const robotics: EvidenceItem[] = [
  item(
    "ROBO utility, holder limits and vesting",
    "https://fabric.foundation/blog/introducing-robo",
    "Fabric Foundation", "2026-02-24", "challenges",
    "Fabric describes ROBO fees and staking for robot payments, identity and coordination. Participation provides no hardware ownership or revenue rights; investor and team allocations have a 12-month cliff followed by 36-month vesting.",
    "Robotics adoption is separate from token-holder returns. Holder rights and future unlocks qualify the investment argument.",
  ),
  item(
    "Machine bonds and the current peaq burn configuration",
    "https://docs.peaq.xyz/peaqchain/learn/tokenomics",
    "peaq", null, "challenges",
    "peaq documents transaction fees, staking and machine activation bonds. It also states that the bond-decay burn address is unset, so the designated burn portion does not currently reduce total supply.",
    "Machine activity offers a utility case, but planned burning should not be treated as active deflation. Inflation, vesting and execution remain relevant.",
    "docs",
  ),
  item(
    "Shared spatial perception for robots and devices",
    "https://www.auki.com/posemesh/fundamentals",
    "Auki", null, "supports",
    "Auki describes a decentralized spatial network for devices including robots, with AUKI burned for service access and staked by participating infrastructure operators.",
    "The documented perception and token-access roles support robotics infrastructure exposure. Material usage and resulting token demand still need independent verification.",
    "docs",
  ),
  item(
    "Precision positioning for autonomous machines",
    "https://geodnet.com/network",
    "GEODNET", null, "supports",
    "GEODNET describes a network delivering RTK positioning corrections for robotics, drones and autonomous vehicles through compatible receivers and service APIs.",
    "Precision navigation is a concrete robotics infrastructure role. The product page does not establish how much robotics revenue reaches GEOD holders.",
    "docs",
  ),
];
const gaming: EvidenceItem[] = [
  item("Infrastructure that makes onchain gaming easier", "https://www.immutable.com/chain", "Immutable", null, "supports",
    "Immutable describes a gaming chain with Unity and Unreal SDKs, sponsored gas and wallet creation through email or social sign-in.",
    "Removing wallet and gas friction supports the player-adoption case. A game pipeline is not proof of lasting players or higher token prices.", "docs"),
  item("RON utility and supply", "https://www.roninchain.com/ron", "Ronin", null, "challenges",
    "Ronin describes RON’s network uses and treasury inflows, while reporting a circulating supply below its total supply.",
    "Network use and token returns can diverge, and circulating supply is below total supply. The page alone does not prove demand will absorb the remaining supply.", "docs"),
];
const compute: EvidenceItem[] = [
  item("RENDER payments for compute work", "https://know.rendernetwork.com/basics/the-render-spl-token", "Render Network", null, "supports",
    "Render explains the Solana token’s role in a burn-and-mint model, where users burn RENDER for dollar-valued work credits.",
    "Compute work has a documented token-payment mechanism. Growth in usage still needs to be measured before assuming a price benefit.", "docs"),
  item("Open intelligence with token incentives", "https://www.bittensor.com/docs", "Bittensor", null, "supports",
    "Bittensor describes independent subnets producing compute, inference, storage and prediction, with TAO rewards for network participants.",
    "A functioning incentive framework supports the open-intelligence premise. Token rewards do not establish external demand or profitable subnet economics.", "docs"),
  item("Compute burns coexist with emissions", "https://know.rendernetwork.com/basics/burn-mint-equilibrium", "Render Network", null, "challenges",
    "Render’s burn-and-mint documentation describes burning tokens for completed work alongside scheduled token emissions to network contributors.",
    "Usage burns coexist with new token emissions. More AI activity does not automatically make supply deflationary or the whole basket profitable.", "docs"),
];
const bitcoinRisks = item("Volatility remains part of Bitcoin", "https://bitcoin.org/en/you-need-to-know", "Bitcoin.org", null, "challenges",
  "Bitcoin.org explains that the price can change sharply over short periods and that the network remains in active development.",
  "Open settlement does not remove price volatility. A longer-term adoption thesis can still suffer a large drawdown.", "docs");
const bundles: Record<string, { items: EvidenceItem[]; note: string; reviewedAt?:number }> = {
  "onchain-gaming": { items: gaming, reviewedAt: Date.parse("2026-09-30T00:00:00Z"), note: "Selected gaming project documentation. These sources cover infrastructure and token mechanics, not a complete player-retention study or the whole basket. No verified social sample is included." },
  "onchain-gaming-expanded": { items: gaming, reviewedAt: Date.parse("2026-09-30T00:00:00Z"), note: "Selected Immutable and Ronin documentation; the other holdings need separate assessment. This is a narrow project-source sample, not evidence of a sector-wide return or current social consensus." },
  "game-over": { items: [
    { ...gaming[1], stance: "supports", relevance: "A gap between circulating and total supply supports watching supply pressure in the short thesis. It does not establish scheduled unlocks, sector-wide weakness or an imminent decline." },
    { ...gaming[0], stance: "challenges", relevance: "Easier onboarding and developer tools are a credible adoption countercase to shorting gaming. Growing usage or a narrative rally can move prices against a short." },
  ], reviewedAt: Date.parse("2026-09-30T00:00:00Z"), note: "The same product evidence is assessed from this bearish take’s perspective. These two project sources do not establish a sector-wide decline, short availability or execution costs. No verified social sample is included." },
  "intelligence-economy": { items: compute, reviewedAt: Date.parse("2026-09-30T00:00:00Z"), note: "Selected Render and Bittensor documentation. Infrastructure roles and incentives support parts of the premise, without measuring paid external demand or proving token returns. No verified social sample is included." },
  "intelligence-economy-expanded": { items: compute, reviewedAt: Date.parse("2026-09-30T00:00:00Z"), note: "Selected compute and intelligence documentation; these sources do not assess every holding in the nine-token basket. No verified social sample or independent comparison of paid demand is included." },
  "digital-hard-money": { items: [
    item("The peer-to-peer settlement premise", "https://bitcoin.org/bitcoin.pdf", "Satoshi Nakamoto", "2008-10-31", "supports", "The original Bitcoin paper proposes peer-to-peer electronic payments using a distributed proof-of-work record rather than a trusted intermediary.", "The protocol has a concrete open-settlement design. This supports the monetary-use premise, rather than proving future global adoption or token appreciation.", "research", "community"),
    bitcoinRisks,
  ], reviewedAt: Date.parse("2026-09-30T00:00:00Z"), note: "Historical Bitcoin design and current project risk guidance. ETH’s different monetary mechanics need separate assessment. These are not current market signals or a social sentiment sample." },
  "bitcoin-amplified": { items: [
    { ...majors[0], stance: "supports", relevance: "Spot ETP approval expanded a route to Bitcoin exposure. This historical access catalyst does not establish that the next move is up." },
    bitcoinRisks,
    item("How perpetual positions are liquidated", "https://hyperliquid.gitbook.io/hyperliquid-docs/trading/liquidations", "Hyperliquid", null, "challenges", "Hyperliquid documents mark-price liquidation when account equity falls below maintenance margin, with different consequences for cross and isolated positions.", "Leverage can exhaust collateral before a long-term bullish call plays out. Liquidation estimates also depend on margin, funding and other positions.", "docs"),
  ], reviewedAt: Date.parse("2026-09-30T00:00:00Z"), note: "Historical access context and current product-risk documentation. No recent price-action evidence confirms a breakout. Shot Call’s paper liquidation model is simplified and does not execute external orders." },
  "week-in-stables": {
    reviewedAt: Date.parse("2026-09-30T00:00:00Z"),
    items: [
      item("USDC’s dollar target", "https://www.circle.com/usdc", "Circle", null, "supports",
        "Circle describes USDC as a dollar stablecoin designed for 1:1 redemption, with access through exchanges and wallets for individuals.",
        "A dollar target reduces exposure to crypto price swings while waiting for a new entry. This does not prove that sitting out the next week will beat staying invested.", "docs"),
      item("Reserve disclosures and attestations", "https://www.circle.com/transparency", "Circle", null, "supports",
        "Circle publishes reserve disclosures and monthly third-party assurance reports. It describes backing in cash, short-dated Treasuries and overnight Treasury repos.",
        "Published reserve reports make the backing easier to check. They do not remove issuer, custody or redemption risk.", "docs"),
      item("No yield entitlement or deposit insurance", "https://www.circle.com/legal/usdc-terms", "Circle", null, "challenges",
        "Circle’s terms state that USDC itself pays no interest, is not covered by deposit insurance and can face blocked addresses or redemption restrictions.",
        "Holding USDC alone earns no yield and keeps issuer and redemption risks. Sitting out also gives up any crypto rally during the week.", "docs"),
    ],
    note: "Issuer documentation reviewed September 30, 2026. The opportunity-cost point is our reading of holding a dollar asset rather than volatile crypto. These sources do not predict next week’s market or provide a representative sentiment sample; no verified social posts are included.",
  },
  [VITALIK_CALL_ID]: {
    items: VITALIK_EVIDENCE,
    reviewedAt: VITALIK_REVIEWED_AT,
    note: 'Selected public investment announcements, project documentation and historical reporting, reviewed September 30, 2026. Sources verify project connections, not current personal holdings, token entry prices or expected returns. This is not an exhaustive portfolio or a representative social-media sentiment sample. The “can do no wrong” claim is the call’s conviction; Nocturne provides a concrete countercase.',
  },
  "hormuz-reopened": {
    items: [
      item('Supply recovery can ease oil prices','https://www.eia.gov/outlooks/steo/archives/sep26.pdf','EIA','2026-09-09','supports','EIA forecasts improving Middle East flows and production, followed by rebuilding inventories and lower oil prices in 2027. It also expects near-term prices to remain elevated while inventories are depleted.','Earlier shipping normalization could reduce the disruption premium, which is the oil-short thesis. This is our inference from a dated forecast, not a guarantee of lower prices by November 30.','research','independent'),
      item('A delayed recovery remains a credible countercase','https://www.iea.org/reports/oil-market-report-september-2026','IEA','2026-09-11','challenges','The September Oil Market Report pushes expected Gulf recovery into 2027 amid renewed disruption and depleted inventories.','A prolonged disruption challenges both the November traffic deadline and the timing of price relief. Reopening headlines alone need not restore normal shipping.','research','independent'),
      item('Tokenized-stock eligibility and access restrictions','https://docs.ondo.finance/ondo-stocks/eligibility','Ondo',null,'challenges','Ondo Stocks restricts access by jurisdiction, including the United States and Canada, and applies additional eligibility conditions.','A tokenized fund’s existence does not establish a usable short venue. This take therefore models paper shorts without promising borrowing or executable orders.','docs'),
      item('The exact Hormuz YES contract','https://polymarket.com/event/strait-of-hormuz-traffic-returns-to-normal-by-november-30-20260810151158765','Polymarket',null,'context','The market resolves against IMF PortWatch transit data: a seven-day average of at least 60 cargo and tanker calls on any date through November 30, 2026. Final data may arrive later under its rules.','A diplomatic announcement or one ship passing is insufficient. This verifies the contract’s conditions, rather than independently supporting the reopening forecast.','docs'),
    ],
    note:'Selected September forecasts and instrument documents. Earlier reopening and lower oil prices are the author’s hypothesis. No verified social sample is included. The external market was accepting orders when reviewed; current status, odds, execution and settlement must be checked at its venue.',
  },
  "pokemon-repacks": {
    items: pokemonRepacks,
    note: "Selected project documentation covers physical-card repacks and a separate digital NFT segment. CARDS and FWA do not represent ownership of Pokémon cards. No verified social sample or independent comparison of platform activity is included; these sources do not validate the paper weights.",
  },
  "robotics-economy": {
    items: robotics,
    note: "Selected project sources cover robot coordination, machine infrastructure, spatial perception and navigation. No verified social sample or independent deployment and revenue assessment is included. Product utility does not establish token returns or validate the paper weights.",
  },
  "gacha-collectibles": {
    items: gacha,
    note: "Selected sources focus on CollectorCrypt. FWA and the wider gacha market need additional research. The social post is anecdotal; no credible opposing social post was included.",
  },
  "gacha-supercycle": {
    items: gacha,
    note: "These sources cover physical-card gacha, while this older basket holds adjacent gaming tokens. They do not validate those allocations. The social sample is one collector’s opinion.",
  },
  "privacy-repriced": {
    items: privacy,
    note: "Selected historical examples, including opposing social perspectives. These posts do not represent the whole community or current market sentiment.",
  },
  "eth-to-7000": {
    items: ethereum,
    note: "The original take does not identify the Vitalik paper. These official sources do not establish the $7,000 target. No verified social posts are included; publisher diversity is limited.",
  },
  "majors-bottom": {
    items: majors,
    note: "Historical Bitcoin context only; it does not establish a current bottom for BTC, ETH or SOL. No verified current-market or social sample is available in this collection.",
  },
  "launchpad-economy": {
    items: launchpads,
    note: "Selected project sources, including historical launch mechanics. Independent comparisons, DAO coverage and verified social posts are missing. This does not assess the claim that all other sectors are unattractive.",
  },
  "stock-tokens-win": {
    items: stocks,
    note: "Selected product and regulatory sources. No verified social posts are included. Product adoption is separate from value accruing to ONDO, INJ, LINK or SOL.",
  },
  "everything-onchain": {
    items: stocks,
    note: "These sources cover tokenized equities within the broader RWA theme. Other asset classes and verified social perspectives need more research.",
  },
};
export async function curatedEvidence(
  thesis: Thesis,
): Promise<EvidenceReport | null> {
  const example = EXAMPLES.find((t) => t.id === thesis.id),
    bundle = bundles[thesis.id];
  if (!example || !bundle) return null;
  const fingerprint = await evidenceFingerprint(thesis);
  if (fingerprint !== (await evidenceFingerprint(example))) return null;
  return {
    id: `curated-${thesis.id}-${new Date(bundle.reviewedAt??reviewed).toISOString().slice(0,10).replaceAll('-','')}`,
    thesisId: thesis.id,
    fingerprint,
    take: thesis.body,
    generatedAt: bundle.reviewedAt??reviewed,
    basis: "curated",
    items: bundle.items,
    coverageNote: bundle.note,
  };
}
