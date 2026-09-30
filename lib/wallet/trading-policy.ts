// Real trade fees require a verified collection integration. Do not enable
// wallet swaps until quotes collect and disclose the configured entry and profit-share fees.
export const WALLET_TRADE_FEES_READY = false;
export const WALLET_TRADE_SETUP_MESSAGE =
  "Wallet trading is awaiting fee collection setup. You can still fund your wallet and view balances, or trade with paper funds.";
export function assertWalletTradeReady(kind: "buy" | "sell" | "fund") {
  if (kind !== "fund" && !WALLET_TRADE_FEES_READY)
    throw new Error(WALLET_TRADE_SETUP_MESSAGE);
}
