import type { Token } from './data';
import type { EcosystemProduct } from './research';
import type { EvidenceItem } from './evidence/types';

export const VITALIK_CALL_ID = 'in-vitalik-we-trust';
export const VITALIK_REVIEWED_AT = Date.parse('2026-09-30T00:00:00Z');
// An investment-portfolio prompt is distinct from a take about a Vitalik paper.
export const VITALIK_PORTFOLIO_PROMPT = /\bvitalik\b[\s\S]*\b(?:invest(?:ed|ments?|ing)?|portfolio|backed|backs|bets|can do no wrong)\b|\b(?:invest(?:ed|ments?|ing)?|portfolio|backed)\b[\s\S]*\bvitalik\b/i;
export function isVitalikPortfolio(thesis: { id: string; parent?: string; body: string }): boolean {
  return thesis.id === VITALIK_CALL_ID || thesis.parent === VITALIK_CALL_ID || VITALIK_PORTFOLIO_PROMPT.test(thesis.body);
}

export const VITALIK_TOKENS: Record<string, Token> = {
  STRK: {
    symbol: 'STRK', name: 'Starknet', color: '#eb9baa', icon: 'starknet', coingeckoId: 'starknet', image: '/coins/STRK.png',
    kind: 'Platform', fit: 'StarkWare-backed network',
    reason: 'StarkWare lists Vitalik among its investors. STRK is the token of Starknet, the network built by StarkWare, with fees, staking and governance functions. This is ecosystem exposure to an investee’s product, not StarkWare equity or a copy of Vitalik’s original investment.',
    risk: 'Network adoption, competition and token supply can outweigh the backer narrative. STRK holders do not own StarkWare, and historical backing does not establish Vitalik’s current holdings or endorsement.',
    source: 'https://starkware.co/about-us/', identitySource: 'https://www.starknet.io/blog/starknet-token-is-deployed-on-ethereum/',
    contract: '0xca14007eff0db1f8135f4c25b34de49ab0d42766',
  },
  MEGA: {
    symbol: 'MEGA', name: 'MegaETH', color: '#eef19c', icon: 'megaeth', coingeckoId: 'megaeth', image: '/coins/MEGA.png',
    kind: 'Platform', fit: 'Documented seed investment',
    reason: 'MegaETH’s own public-sale announcement names Vitalik as an investor. MEGA is MegaETH’s native protocol token. The call buys that project’s token as a way to express conviction in its real-time Ethereum execution thesis; it does not acquire his equity or token-warrant terms.',
    risk: 'Execution, decentralization tradeoffs, token releases and competing networks matter. This is MegaETH’s MEGA, not similarly named meme tokens. An early investment is not a guarantee of token returns.',
    source: 'https://www.megaeth.com/blog-news/the-megaeth-public-sale-a-reminder-to-stand-on-business', identitySource: 'https://megaeth.builders/token',
    chain: 'MegaETH', contract: '0x28b7e77f82b25b95953825f1e3ea0e36c1c29861',
  },
  AZTEC: {
    symbol: 'AZTEC', name: 'Aztec', color: '#ab99ce', icon: 'aztec', coingeckoId: 'aztec', image: '/coins/AZTEC.png',
    kind: 'Platform', fit: 'Documented Series A investment',
    reason: 'Aztec’s December 2021 Series A announcement names Vitalik as an angel investor. AZTEC is the network’s documented token for staking, governance and fee-related functions. It expresses exposure to programmable privacy, rather than ownership of Aztec Labs or the terms of the funding round.',
    risk: 'Privacy adoption, emissions, sequencer concentration and technical execution affect returns. Holding AZTEC is different from staking it; this basket does not earn staking rewards. Historical backing does not imply infallibility.',
    source: 'https://aztec.network/blog/aztec-network-raises-17-million-series-a-from-paradigm-to-bring-programmable-privacy-to-web3', identitySource: 'https://docs.aztec.network/participate/token',
    chain: 'Ethereum', contract: '0xA27EC0006e59f245217Ff08CD52A7E8b169E62D2',
  },
};

export const VITALIK_PRODUCTS: EcosystemProduct[] = [
  { name: 'Starknet / StarkWare', url: 'https://starkware.co/about-us/', type: 'Investor listed', description: 'StarkWare’s investor directory documents the connection; Starknet supplies the token exposure.', tokenNote: 'STRK · network token, not StarkWare equity', symbol: 'STRK' },
  { name: 'MegaETH', url: 'https://www.megaeth.com/', type: 'Seed investment', description: 'Explore the real-time Ethereum network whose funding announcement names Vitalik.', tokenNote: 'MEGA · protocol token', symbol: 'MEGA' },
  { name: 'Aztec', url: 'https://aztec.network/', type: 'Series A investment', description: 'Programmable privacy on Ethereum, with documented angel participation in its 2021 financing.', tokenNote: 'AZTEC · network token', symbol: 'AZTEC' },
  { name: 'Polymarket', url: 'https://polymarket.com/', type: 'Project link only', description: 'Vitalik participated in its 2024 Series B. Event YES / NO shares express an event outcome, not ownership of the platform.', tokenNote: 'No verified platform token included' },
  { name: 'RISE', url: 'https://risechain.com/', type: 'Watchlist', description: 'RISE names Vitalik among its backers. Its trading chain and points program are separate from a verified investable project token.', tokenNote: 'No verified project token included' },
  { name: 'Kakarot / KKRT Labs', url: 'https://www.linkedin.com/company/kkrt-labs', type: 'Historical investment', description: 'KKRT Labs documents Vitalik’s support in its 2023 funding and says it is now part of Zama. That does not establish an investment by Vitalik in Zama’s token.', tokenNote: 'No Kakarot or Zama token allocation' },
  { name: 'Nocturne', url: 'https://cointelegraph.com/news/vitalik-buterin-nocturne-labs-shuts-down', type: 'Historical · wound down', description: 'The privacy startup’s seed announcement named Vitalik. It later wound down, a concrete counterexample to treating any backer as infallible.', tokenNote: 'Historical context · no token allocation' },
];

export const VITALIK_EVIDENCE: EvidenceItem[] = [
  { title: 'StarkWare’s investor directory', url: 'https://starkware.co/about-us/', publisher: 'StarkWare', publishedAt: null, author: null, kind: 'docs', stance: 'supports', relationship: 'project', summary: 'StarkWare includes Vitalik in its investor section and identifies Starknet as one of its products.', relevance: 'Supports the historical backer link. STRK remains a network token, rather than ownership of the company he invested in.' },
  { title: 'MegaETH’s public sale and investor history', url: 'https://www.megaeth.com/blog-news/the-megaeth-public-sale-a-reminder-to-stand-on-business', publisher: 'MegaETH', publishedAt: null, author: null, kind: 'article', stance: 'supports', relationship: 'project', summary: 'MegaETH names Vitalik among its investors and distinguishes MEGA investors from users.', relevance: 'Verifies the project investment and token relationship. It does not establish the attractiveness of today’s token price.' },
  { title: 'Aztec announces its $17 million Series A', url: 'https://aztec.network/blog/aztec-network-raises-17-million-series-a-from-paradigm-to-bring-programmable-privacy-to-web3', publisher: 'Aztec', publishedAt: '2021-12-16', author: null, kind: 'article', stance: 'supports', relationship: 'project', summary: 'Aztec’s funding announcement includes Vitalik among its participating angel investors.', relevance: 'Documents a historical investment. Buying AZTEC today is different from the private financing and does not copy his entry price.' },
  { title: 'AZTEC token utility and supply', url: 'https://docs.aztec.network/participate/token', publisher: 'Aztec', publishedAt: null, author: null, kind: 'docs', stance: 'context', relationship: 'project', summary: 'The documentation identifies the Ethereum token contract and explains staking, governance, fee mechanics and issuance.', relevance: 'Checks the basket’s token identity and utility. Staking rewards and issuance are distinct from simple token appreciation.' },
  { title: 'Polymarket’s 2024 Series B', url: 'https://www.coindesk.com/business/2024/05/14/peter-thiels-founders-fund-vitalik-buterin-back-45m-investment-in-polymarket', publisher: 'CoinDesk', publishedAt: '2024-05-14', author: 'Marc Hochstein', kind: 'article', stance: 'context', relationship: 'independent', summary: 'CoinDesk reports the founder’s confirmation that Vitalik participated in Polymarket’s Series B.', relevance: 'Explains why Polymarket appears in the project directory. Buying event shares is not exposure to the platform’s equity.' },
  { title: 'RISE names its backers', url: 'https://risechain.com/', publisher: 'RISE', publishedAt: null, author: null, kind: 'docs', stance: 'context', relationship: 'project', summary: 'The official RISE site names Vitalik among its backers and describes the trading chain.', relevance: 'Documents another project connection, but does not verify a project token for this basket.' },
  { title: 'Kakarot’s funding and acquisition history', url: 'https://www.linkedin.com/company/kkrt-labs', publisher: 'KKRT Labs', publishedAt: null, author: null, kind: 'article', stance: 'context', relationship: 'project', summary: 'The company describes Vitalik’s support in its 2023 funding and its acquisition by Zama.', relevance: 'A historical connection does not establish that Vitalik bought Zama’s token. Neither token is included on that assumption.' },
  { title: 'Nocturne announced Vitalik’s seed participation', url: 'https://www.globenewswire.com/news-release/2023/10/25/2766454/0/en/Nocturne-Raises-6M-Seed-Round-to-Bring-Private-Accounts-to-Ethereum.html', publisher: 'Nocturne Labs', publishedAt: '2023-10-25', author: null, kind: 'article', stance: 'context', relationship: 'project', summary: 'The company’s press release names Vitalik in its $6 million seed round.', relevance: 'Establishes the historical investment before the company’s later wind-down. No token exposure is included.' },
  { title: 'A Vitalik-backed project can still fail', url: 'https://cointelegraph.com/news/vitalik-buterin-nocturne-labs-shuts-down', publisher: 'Cointelegraph', publishedAt: '2024-06-06', author: 'Zoltan Vardai', kind: 'article', stance: 'challenges', relationship: 'independent', summary: 'Nocturne announced it was winding down despite its seed funding from Vitalik and other investors.', relevance: 'Directly challenges the “can do no wrong” premise. A respected backer cannot guarantee product survival or profitable tokens.' },
];
