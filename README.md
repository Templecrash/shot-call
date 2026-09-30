# Shot Call

Read [START-HERE.md](START-HERE.md) for current setup, fees, and architecture. Some sections below document earlier versions.

A crypto thesis product with separate paper trading and browser-wallet trading, inspired by the supplied Supertake references. Built with React, Vinext, Cloudflare Workers, D1 and the Sites starter.

## Product

- Create a thesis from a take about privacy, majors, Ethereum, launchpads, tokenized-stock platforms, gaming, AI/compute, tokenization or digital scarcity.
- AI researches arbitrary takes with web search, resolves token identities and icons against CoinGecko, and proposes a reviewable basket with sources, risks and weights. Curated examples remain available as an explicit fallback.
- Adjust weights (must total 100%), add/remove tokens, publish and fork ideas.
- Discover community theses and open permanent `/take/:id` pages.
- Sign in through Sites to receive a $10,000 paper balance and save a portfolio.
- Paper buy/sell complete baskets, including partial sales.
- Configure percentage take-profit and stop-loss exits; test these with explicit simulated market moves.
- Copy a thesis URL or export a cinematic PNG card.
- Topic-specific generated artwork follows each thesis across the feed, detail page and share card. A brief opening drift and subtle pointer parallax respect reduced-motion settings.

## Investment amounts and trading fees

The investment input and keyboard-accessible balance slider offer 25%, 50%, 75%, and Max presets. Paper trades use available paper cash; wallets show spendable USDC on the selected network, floored to cents. Unknown balances are unavailable, never shown as zero.

Every new paper buy, sale, and automatic rule exit deducts a 2% trading fee, rounded to the nearest cent. A $100 buy spends $100 and allocates $98. A $100 gross sale returns $98 before any creator profit share. Buys include the fee in cost basis; creator profit sharing is calculated after trading fees and loss recovery. Fees are recorded separately in `orders.trading_fee` and reflected in activity, performance, and leaderboards. Migration `0007_fine_joystick.sql` preserves historical orders with a zero fee. Existing client tabs must refresh and review the new fee before placing orders. Funding, simulated price moves without an exit, follows, and creator income are not trades.

Real-wallet trading is awaiting a verified fee collection integration and recipient. `lib/wallet/trading-policy.ts` blocks buy/sell quotes and wallet execution until that integration is implemented. Funding, balances, and reconciliation of existing transactions remain available. No real fees have been collected. Do not simply enable the readiness flag without implementing, validating, and disclosing collection in each quote.

Verification: `node --import tsx --test tests/trading-fees.test.ts tests/profit-share.test.ts tests/performance.test.ts tests/leaderboard.test.ts`. Browser checks cover amount entry, percentage presets, Max, overspending, mobile layout, fee disclosure, and network-specific balances with a non-signing test wallet.

## Browser wallets and USDC

Connect an installed EIP-6963 browser wallet (MetaMask, Rabby, Coinbase Wallet and compatible extensions) or an injected `window.ethereum` wallet. The app never asks for a private key or holds a custodial balance. Reown/WalletConnect QR pairing is deferred until a project ID is supplied; no ID is required for this version.

- Receive native USDC directly at the connected address on Base, Ethereum, Arbitrum, Optimism, Polygon and Avalanche. The address QR does not select the sending network.
- View on-chain USDC and native gas balances by network, refreshed every 30 seconds while visible. Unavailable networks are shown as unavailable, never zero. Dollar totals use a $1 reference per USDC, not a live stablecoin price.
- Review live LI.FI quotes and confirm individual transactions in the wallet. Funding defaults to Base; cross-chain routes can acquire assets on the destination networks below. Token approvals are capped to the source amount. Maximum slippage is 0.5%; a deteriorated minimum, changed account or changed destination stops execution.
- Buy supported thesis baskets or sell 25%, 50% or 100% of their recorded token quantities back to USDC. Current balances are checked by the quote API and the execution SDK.
- View per-leg status and explorer links. Confirmed fills survive a later rejected or failed leg. Pending or ambiguous submissions block a new trade until checked or explicitly dismissed after manual wallet review. Web Locks coordinate simultaneous tabs. No basket is automatically resubmitted.

| Asset | Execution network |
| --- | --- |
| ETH | Base, Ethereum, Arbitrum or Optimism; Base when funding from Polygon/Avalanche |
| ONDO, LINK, IMX, AXS, POLS, DAO | Ethereum |
| GHST | Polygon |
| USDC | Native USDC on each of the six funding networks |

Contracts are fixed in `lib/wallet/networks.ts`, checked against the LI.FI token catalog and [Circle’s official USDC addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses). No symbols are used to discover an arbitrary contract at runtime. BTC, SOL, XMR, ZEC, RON, PUMP, INJ, TAO, NEAR and RENDER are not supported by this EVM integration. The UI requires forking/editing those baskets or using paper mode; it never substitutes a wrapped or similarly named token. Route availability still depends on amount, liquidity and the provider.

USDC reserves remain spendable in the wallet and are not locked to a thesis. Basket trades are separate transactions, not an atomic fund purchase. Native gas is needed on each source network. Selling tokens held on Ethereum requires ETH on Ethereum even if the original purchase was funded from Base.

## Product boundaries

Generation defaults to server-side OpenAI research when OPENAI_API_KEY is configured. Without it, the app reports that AI is unavailable; it never silently relabels a preset as AI. Explicit curated-example mode remains available. The paper mode remains a simulation backed by D1 and is never credited from wallet deposits. Charts remain illustrative. Automatic rebalancing, live take-profit and stop-loss execution, Solana connectivity, custodial accounts, fiat on-ramps, and WalletConnect QR pairing are not implemented. Paper exit rules run only when the user applies a simulated price move. The Site’s existing private access policy is preserved.

Wallet activity and confirmed token quantities are stored under the connected address in this browser’s local storage. They are not a cross-device ledger and do not track external transfers. The wallet’s actual on-chain balance is authoritative. Keep browser storage to retain basket attribution; clearing it does not affect assets, which can still be managed in the wallet. A dismissed ambiguous entry is not credited as a confirmed holding. There is no backend wallet authentication or automatic trading agent.

Public RPCs and LI.FI’s unauthenticated API are used. The server validates balances and allocations, then the browser requests quotes directly from LI.FI, avoiding a shared hosting IP quote bottleneck. Base reads fail over between [PublicNode](https://base.publicnode.com), dRPC and the Base public endpoint; provider outages and rate limits are surfaced. Configure production RPC/API credentials and complete a funded, user-signed acceptance trade before a broader money-handling rollout. The implemented flow was verified with read-only live quotes and a transaction-rejecting test wallet; no funded transaction was performed during development.

## Live AI generation

Set `OPENAI_API_KEY` as a secret in the existing Site's production runtime environment. It is read only by server routes and is never returned to the browser. Optional `OPENAI_MODEL` overrides the default `gpt-6-sol`; the model must support Responses API web search and strict structured output. Optional `COINGECKO_API_KEY` is a CoinGecko Demo API key for metadata limits. Local development requires the equivalent Worker environment binding; production variables are separate from local configuration. Deploy a saved Site version after changing production runtime variables to apply the new environment revision.

The default `/api/generate` request uses OpenAI Responses with required web search. It validates output structure, source provenance, ticker, CoinGecko ID and project homepage. Unknown or inconsistent identities stay on a watchlist, with their proposed allocation moved to reserve. No token is substituted by ticker. New tokens use immutable `cg:<id>` allocation keys and remain paper-only unless separately integrated with the wallet's fixed asset registry. AI explanations and product links are saved with the thesis. Editing the original conviction marks its research stale.

Paid generation requires sign-in. Each user can have one active request and up to 30 requests per rolling day. Requests have unique IDs, and repeat IDs recover the saved result rather than initiating another model call. D1 persists the prompt, raw provider response, usage, model, status and normalized draft. Actual billing estimates remain unavailable (`estimated_cost_cents` is null); usage is retained for later reconciliation. Drafts can be recovered at `/?draft=<generation-id>` and the owner-only `/api/generate?id=<generation-id>` endpoint. Source-token metadata is always loaded from the server's verified generation or parent thesis when publishing, never trusted from the browser.

`drizzle/0001_sad_sabretooth.sql` adds generation history. Run `npm run test:ai` for generation, identity, source, reserve, error and persistence-contract tests. Before the API credential is configured, workflow tests use explicit fixtures; no live AI success is implied by those tests.

## Persistence and security

D1 stores theses, user accounts, paper holdings and orders. Sites provides authenticated user identity. API writes reject anonymous users and cross-origin requests. Allocations and amounts are validated on the server. Orders are idempotent by request ID; account revisions and D1 batches prevent concurrent balance changes from overwriting each other. The paper backend preserves theses with active paper holdings. The wallet UI forks edits when the current browser records wallet holdings. Wallet signing rechecks the connected account and network, exact token contracts, source amounts, minimum output, transaction destination and allowance cap. Trading state is never inferred from the paper account.

## Run

Use Node 22.13+ and npm. Run `npm ci` then `npm run dev`. For first-run local persistence, generate the Worker with `npm run build`, then apply `drizzle/0000_fine_human_fly.sql` using the D1 local migration command documented in `scripts/` and Sites. Production migrations are included by the Sites build plugin.

```
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_fine_human_fly.sql
```

Local preview offers simulated sign-in at `/signin-with-chatgpt?return_to=/`. Hosted sign-in is handled by Sites and never uses the local simulator.

## Assets

`public/gacha.png`, `public/og.png`, and the eight topic backgrounds in `public/art/` are original built-in ImageGen assets. The topic backgrounds are encoded as WebP for the feed. Final prompts are recorded in `IMAGE-PROMPTS.md`. This demo uses a curated artwork library; it does not generate new images at runtime. Token icons are from https://github.com/ErikThiart/cryptocurrency-icons, downloaded from verified repository paths; the PUMP logomark comes from Pump.fun’s official site. Token research links are stored in `lib/data.ts`. The weights are illustrative examples, not personalized financial advice.

The ETH $7,000 example is an author thesis, not a forecast. Its referenced Vitalik paper is explicitly unverified because no source was supplied.

## Verification

Use Node 24+ for `npm run test:wallet` (Node module mocks are experimental). Tests cover exact USDC arithmetic, allocation rounding, unsupported tokens, route/recipient tampering, capped approvals, partial/refunded outcomes, account changes, failed later legs, expired quotes, ambiguous submissions and RPC provider fallback. Run `npx tsc --noEmit --incremental false` and `npm run build` for the full app. Wallet components and APIs also pass targeted ESLint checks except the intentional tiny local token-icon image warning.

## Creator identity

Creators add a display name, Twitter/X profile URL or handle, short bio, and optional profile photo from Profile → Add Twitter/X profile. The handle is parsed from that URL and rendered consistently on the feed, take pages, creator pages and exported share cards. Links are self-reported: X OAuth verification and automatic photo synchronization are not configured. Editorial examples stay attributed to Calledit.ai without inventing a Twitter account.

D1 `creator_profiles` owns identity by authenticated user ID; clients cannot assign another creator when publishing. Profiles are joined at read time so edits update existing takes. New publications require a saved creator profile. `/creator/:id` and its read endpoint expose public identity and published theses, never private investment activity or balances. Profile photos are compressed in the browser, validated as bounded JPEG/PNG/WebP uploads, saved in the `BUCKET` R2 binding and served by an avatar endpoint. Replaced photos are removed. Migration `0002_big_living_tribunal.sql` adds the profile table and owner index.

Run `node --import tsx --test tests/creators.test.ts` for URL parsing, unsafe-link rejection, identity fallbacks and image-type checks. Local browser verification covers saving/uploading, reload persistence, attribution, editing across existing takes, public-profile navigation, mobile layout and share export.

## Paper leaderboard

`/?view=leaderboard` ranks best takes and investors for the current calendar week (Monday 00:00 UTC) or month (first day, 00:00 UTC). The selected view and period are shareable URL parameters. Creator profiles include an explicit, default-off leaderboard participation switch; turning it off excludes the investor and their positions from both rankings. Only profile information, return percentages and aggregate counts are published—never personal balances or individual orders. Wallet activity is not ranked.

Take return is the combined simulated P&L of eligible opted-in backers divided by opening position value plus new paper purchases during the window. Investor return is the percentage change in total paper equity including cash. Complete ordered ledgers are replayed across period boundaries, so new purchases, partial sells and full rule exits are handled consistently. Current account/position snapshots must reconcile or that investor is excluded. Untraded example illustrations create no performance. Manually applied scenario moves are explicitly labeled as simulated rather than live-market returns. Equal displayed percentages share competition ranks.

The read-only `/api/leaderboard?period=week|month` endpoint returns at most 100 takes and 100 investors. It refuses oversized replay snapshots instead of silently truncating the underlying history (current limits: 1,000 opted-in accounts and 50,000 orders/positions). This initial demo can move to stored period snapshots if it grows beyond those limits. Migration `0003_freezing_scarlet_spider.sql` adds the default-off opt-in field. Run `npm run test:leaderboard` for calendar boundaries, cash-flow-neutral returns, weighting, exits, reconciliation, privacy exclusion and ties. Browser verification uses temporary local fixtures, all removed afterward; production contains no fabricated ranking results.

## Paper creator profit sharing

Community take creators earn **50 basis points (0.5%) of followers’ realized profit**, in paper credits. Following or buying another creator's take requires explicit agreement; buying also follows the take. Following saves the thesis, but does not automatically copy later changes or forks. A follower must close the position before unfollowing.

Fees settle on manual sales and simulated take-profit/stop-loss exits. The position stores cumulative realized P&L after trading fees, the highest cumulative profit previously reached, and cumulative fees paid. Realized losses must be recovered before another fee is due; this history survives closing, re-entry and unfollowing. Fees are integer cents: `floor(highest cumulative profit in cents / 200) - fees already paid`, so fractional fee cents carry forward across partial exits. No creator fees apply to purchases, unrealized gains, losses, curated examples or the creator's own positions. Existing positions retain their creator-share exemption, including additions, until fully closed. The 2% trading fee applies to new trades in all positions.

`lib/paper-trading.ts` settles the order, position, follower cash, creator cash, follow agreement and earnings ledger in one atomic D1 batch. Account revisions reject stale writes; a unique operation guard plus the request ID prevents duplicate settlement. Ownership comes from the stored thesis, never from a client-supplied recipient. Migration `0004_true_bill_hollister.sql` adds the follow and earnings ledgers plus the per-position and order accounting fields.

Profile → Creator earnings shows total income, unique followers, invested followers, income per take and recent credits. `/api/creator-earnings` requires sign-in and returns only the caller's earnings; follower identities are not exposed. Investment returns and take rankings deduct creator fees. Incoming creator credits remain available paper cash, are excluded from profile investment gains, and are treated as external cash flows for time-weighted investor rankings. These credits have no withdrawal or real-wallet payout path.

Run `npm run test:profit-share` for settlement, consent, grandfathering, cost-basis rounding, loss recovery, automatic exits, concurrency, idempotency, rollback and net performance checks.

## Thesis evidence and source sentiment

Every published take has a Sources & research section, a basket source directory, and shareable saved evidence links. The main example theses include an explicitly labelled curated reading list with original article/post dates. These are selected sources, not a current social-media feed. Source interpretations are separated from paraphrases and labelled as the app's reading.

With `OPENAI_API_KEY` configured, new AI baskets also include evidence. Signed-in readers can research an existing take through `/api/evidence`, searching public articles, research and indexed social posts for supporting and challenging arguments. Only links present in the provider's web-search sources or citations survive validation; social items require direct post permalinks. Inaccessible content and sparse coverage are disclosed instead of filled with invented posts. Live provider execution has not been verified without an API credential.

Evidence reports are stored in D1 under a request UUID before calling the provider. The original thesis snapshot, model, raw provider response and token usage are retained server-side; raw responses and account identifiers are never returned by the evidence API. Replaying a request ID does not call the provider again. Matching AI reports are cached for six hours; a user may start at most 10 evidence searches per day. Pending requests can be recovered through the report link. No scheduled research runs are configured.

The sentiment indicator is the unweighted supportive share of directional sources, excluding context and duplicate links. It requires at least three directional sources across two source domains or social accounts. It does not represent a market-wide poll, independence-weighted consensus or return probability. Changing the take or allocation, or letting a report age beyond seven days, hides its score until refreshed. Curated reports are attached only to their exact built-in example, not transplanted onto new takes.

Verification: `npm run test:evidence` and `npm run test:ai`. Migration `0005_equal_darwin.sql` adds the evidence report store without changing trading data.

## Basket size

Theses support 1–10 distinct holdings in total, including a USDC reserve. The editor, fork/add flow, publish API, and AI allocation validator enforce the same limit. AI may return fewer when relevance is weak; zero-weight research candidates do not occupy a generated basket slot. The expanded Intelligence Economy and Play, Collect, Own examples demonstrate nine thematic assets plus USDC, with original versions preserved for existing holders. Share-card allocations wrap across lines for larger baskets.

## Position card P&L

My takes shows current value and unrealized P&L in dollars and percent for each open position. P&L compares value with the remaining cost basis, so partial sales are handled correctly. Paper cost includes buy fees and excludes future exit fees. Wallet values use the same verified token prices and confirmed-fill cost basis as Profile, refreshed every minute while the page is visible and on focus. Missing prices or receipts show as unavailable; realized profit remains in Profile rather than being added to open-position P&L.

## Retired sentiment betting

The internal right/wrong pools and their confidence bars have been removed. `/api/predictions` returns 410 and migration `0018` prevents stale workers inserting bets. `retireSentiment` runs an idempotent atomic D1 batch from state reads/writes, returning **gross** unpaid stakes (including entry fees) to all affected users, including dormant accounts. Historical settled outcomes and ledger flows remain intact and excluded from investment performance. External Polymarket instruments and source research are separate and remain available.

## Creator-controlled execution

Each allocation can select spot or an identity-verified Hyperliquid perp, with long/short direction and 1–10× leverage subject to that market’s lower limit. Save, publish and buy verify availability; an unavailable market never silently falls back to cash or spot. Investors follow the published settings. Buys confirm a configuration key and use transaction guards for creator version and exit plan changes.

New positions freeze per-leg execution and creator exits in `execution_state` and `exit_state`. Perps use isolated demo collateral; long and short P&L uses signed notional, each liquidated leg realizes its own cost, and remaining spot or perp legs are independent. Published take-profit stages and a basket-equity stop loss execute on simulated moves. Fees and high-water accounting remain in the existing ledger. Legacy positions retain their original aggregate execution until sold. No live orders, funding charges or external settlement are introduced.

## Feed investor counts and AUM

Home-feed cards show unique investors with open paper positions and the sum of their current position values in cents. Repeated purchases count once; partial sales and simulated price moves change AUM, and full exits remove an investor. Exact thesis IDs keep forks separate. Cash, follows, prediction stakes and browser-local wallet journals are excluded. The feed refreshes on focus and every minute while visible.

The stack shows up to four profiles enrolled in public paper performance, with uploaded photos or initials, plus a remaining-investor count. Private and profile-less investors remain in aggregate counts anonymously. The API never returns individual position values, account identifiers or avatar storage keys. Profile links open the existing public profiles. `npm run test:thesis-investments` checks aggregation, exits, privacy, bounded avatar samples, large-feed batching and failure handling.
