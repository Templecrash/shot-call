# Creator position review and exposure groups

The create/edit preview assesses the current thesis and allocation automatically. The owner also sees this assessment on their saved take. It is a rules-based implementation review, not an AI optimization or a claim of the best execution price. No allocation, hedge or order is automatically changed.

The review compares spot with verified Hyperliquid availability, handles explicit stablecoin and short theses, and separates event risk from asset-price risk. A matching partial short hedge can be illustrated against a supported spot leg; the slider describes external notional, not margin or an executable hedge order. No cross-token beta or optimal hedge percentage is inferred. Sources link to issuer, margin, funding and event-resolution rules.

Holdings and draft allocations are grouped into tokens, stablecoins, tokenized stocks, directed paper shorts, event shares, actual perpetuals, and cash collateral. Eligibility alone never turns spot into perps. Saved derivative positions use their recorded contract keys. Unsupported weights stay shared collateral and are not shown as token holdings. Order previews use chosen execution; sales reduce recorded notional proportionally rather than multiplying current equity by initial leverage.

The current execution remains paper only. Long perp baskets do not support mixed spot/perp execution or short hedges. Tokenized-stock shorts and directed token shorts simulate 1× exposure; they do not establish live borrow availability. Polymarket prices are fetched for verified references, while event settlement remains external and is not automatically applied to paper holdings.

Run `node --import tsx --test tests/position-design.test.ts tests/perps.test.ts` and TypeScript checks. No database changes are required.
