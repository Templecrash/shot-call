# Shot Call — source handoff

Snapshot: published Sites version 78, updated September 30, 2026.
Source commit: `e1590f1ea70795c6e36cce5e5d603241d24b88fb`.
Current site: https://supertake-crypto-sascha.saschadarius.chatgpt.site

Read this file first. README.md contains development history and some older feature descriptions; the setup and current-state notes here take precedence.

## Included

The complete tracked application source: UI, server routes, assets, tests, package lockfile, build tooling, hosting manifest, and all 20 database migrations. The archive omits Git history, the generated TypeScript cache, dependencies, builds, credentials, local runtime state, and production user data. This is a source snapshot, not a production database or account export.

## Run locally

Use Node.js 24 and npm. From this directory:

```sh
npm run install:ci
npm run build

# Run once, against a NEW empty local database. These files are not idempotent.
for migration in drizzle/*.sql; do
  node --import ./scripts/sites-env.mjs \
    ./node_modules/wrangler/bin/wrangler.js d1 execute DB \
    --local --config dist/server/wrangler.json \
    --persist-to .wrangler/state --file "$migration" || exit 1
done

npm run dev
```

Open http://localhost:5173 and use Sign in for the included simulated local account. Later starts only need `npm run dev`. The migration loop above is for macOS/Linux or a compatible shell. Local persistence uses Cloudflare emulation; no Cloudflare account is required for that mode. These startup commands were checked against the source/configuration; this handoff has not been installed on a fresh machine.

Use `npm run dev` for local authenticated testing. `npm start` runs the built Worker and does not install the development sign-in middleware.

## AI configuration

AI token research, evidence, suggested exits, and artwork require a server-side `OPENAI_API_KEY`. The original production site has its server-side credential configured separately. This archive does not contain that API key; a new deployment needs its own server-side credential.

For local development, use an ignored `.env` file with Worker environment bindings. Optional settings are `OPENAI_MODEL`, `OPENAI_IMAGE_MODEL`, and `COINGECKO_API_KEY`. Production secrets must be configured independently in the deployment environment. Never put credentials in browser code or commit them. If using `.dev.vars` instead, add `.dev.vars*` to your ignore rules first.

Curated examples and simulated investment flows are available without an AI credential. Live OpenAI research and counter artwork have been exercised on the original deployment. During token-data outages, exact identities already in the reviewed catalog can be used with source and ticker checks; unknown identities remain on the watchlist. Catalog fallback is disclosed in the research notes. Tokenized-stock discovery also verifies exact Ondo asset identities against the issuer-owned token registry, independently of CoinGecko; issuer-verified instruments retain source, contract, network and logo metadata. Instruments without a verified CoinGecko ID do not have an in-app market-data chart.

## Architecture and current behavior

- React 19 and TypeScript, with Vinext/Vite and Cloudflare Workers.
- D1 binding `DB` for application persistence and R2 binding `BUCKET` for uploads/generated artwork.
- Demo wallet and simulated trading; real-money execution remains disabled by the trading-policy gate.
- Spot/perp exposure, direction, leverage and exit rules are set by the call creator. Counter calls generate eligible opposite exposures using verified instrument metadata; external Polymarket outcomes remain separate instruments.
- Internal sentiment betting has been removed. Profiles, following, invitations, weekly P&L leaderboard, and P&L sharing are included.
- Current fees: 0.05% on new investment capital. Call creators receive no profit fees, including future sales or automatic exits on existing positions. Creator fee settings and earnings promotion are removed. Platform performance fees retain their existing rates and loss-recovery accounting; new calls use the default 0.5% platform rate. Historical fee payments, credits and P&L are preserved. Older README references to creator profit shares and a 2% trading fee are historical.
- Feed cards retain investor counts and profile pictures; AUM is no longer displayed.

Key directories: `app/` (pages and API routes), `components/` (UI), `lib/` (domain logic), `drizzle/` (schema migrations), `public/` (assets), `tests/`, `build/`, and `scripts/`.

## Checks

```sh
node --experimental-test-module-mocks --import tsx --test tests/*.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
```

## Hosting and collaboration

The public source repository is https://github.com/Templecrash/shot-call. This repository starts from a clean snapshot of published Sites version 76, including the Shot Call name and latest countertrade layout. Anyone can view or clone it; collaborators need a separate invitation to push changes. Future Sites edits are not automatically synchronized to this repository.

```sh
git clone https://github.com/Templecrash/shot-call.git
cd shot-call
```

Then follow the local setup above.

Source sharing does not transfer access to the live Sites project, domain, databases, secrets, or connector authorization. `.openai/hosting.json` retains the logical DB/BUCKET bindings required by the build. The original project identifier is omitted from this sharing copy; register a separate project for independent hosting.

Independent hosting requires D1/R2 resources, all migrations, server secrets, and an authentication integration. In particular, `app/chatgpt-auth.ts` trusts identity headers supplied by the Sites edge: an independently public deployment must authenticate users and strip/replace untrusted client identity headers. Update canonical URL metadata for a new domain. This is a Worker application, not a static-site or standard `next start` deployment.
