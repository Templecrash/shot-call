# Thesis research

Curated examples use the dated research below. New takes default to live AI research when the server API credential is configured; that generation has its own timestamp, source list, token identities and watchlist. `lib/research.ts` contains source-backed roles, a gacha candidate directory, and product links. The review date is September 29, 2026. Coverage is not exhaustive and should be reviewed before any expansion of real trading.

## Categorization

Token fit is relative to a thesis. Direct product/network exposure, platform governance, adjacent exposure, infrastructure, reserves and unmatched additions have separate labels. A token's presence in a product ecosystem does not make it a direct claim on that product's revenues or assets.

The gacha directory separates physical-card platforms from digital NFT pools and broad gaming. Distinct project IDs preserve ticker collisions: PowerGacha and Gacha Fund both use GACHA. Candidate identity, chain, project source, migration/planned status and allocation availability are separate fields. Pending candidates are not in the allocation token catalog and therefore cannot be saved as basket assets.

CARDS and FWA use identities published by Collector Crypt and FWA documentation. Their icons were retrieved from the official project sites. Both remain paper-only: Solana is not supported by the current wallet integration, and FWA's special transfer/market rules have not been integrated. Identity verification is not an audit, trading availability check, liquidity review or investment rating.

## Version preservation

The original `gacha-supercycle` allocations remain unchanged, because existing paper holdings resolve their assets by thesis ID. Its page explains the categorization correction and links to `gacha-collectibles`, a new example version. New gacha prompts select the revised example. Generic gaming prompts select `onchain-gaming`. Existing forks are assessed contextually without rewriting their allocations.

## Maintaining the directory

Verify the official project and token identity, including chain and contract/mint, before adding an allocatable token. Never identify a token by ticker alone. Product-only listings do not create an investment asset. Unknown tokens, migrating identities, planned products and testnets must retain their explicit status. Updating research must not silently update an existing holder's basket.

All product links lead to official project pages. A listed product does not imply a verified native token. Links, source claims and statuses are a dated research snapshot, not automatic updates.

## Automatic evidence summaries

Opening a take loads its saved evidence automatically. The consumer sees a TL;DR with up to two supporting and two challenging points, each linked to the source behind the report’s thesis-specific reading. Context sources are never promoted into pros or cons, and missing counterarguments are not invented. Every unchanged editorial example has a dated curated report, including the stablecoin, compute, gaming-short and perpetual examples.

When the owner-configured server `OPENAI_API_KEY` is available, signed-in views automatically research missing reports, changed takes, curated reports or AI reports at least six hours old. The existing server cache, concurrency guard, daily allowance and persisted reports apply. A saved report stays visible during refresh or on failure. Explicit saved-report links keep their original report; older reports are marked. Consumers do not configure credentials or click a research button. Without a server key, only saved or curated research is shown; arbitrary new takes cannot receive live research.

## Validation

`npm run test:research` checks contextual fit, gacha/gaming matching, duplicate tickers, watchlist exclusion, paper-only identity behavior, portfolio preservation and product coverage. Wallet and performance test suites must continue to pass. Browser verification covers the filters, search, add-to-fork action, generation, external links and mobile layout. Local API verification covers saving the revised basket, paper buys/sells, exit rules and protection of active holdings.
