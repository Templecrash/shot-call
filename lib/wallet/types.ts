import type { Route, RouteExtended } from "@lifi/sdk";
import type { LiveAsset } from "./networks";

export type NetworkBalance = {
  chainId: number;
  amount: string | null;
  nativeAmount: string | null;
  error?: string;
};
export type WalletBalances = {
  address: string;
  balances: NetworkBalance[];
  checkedAt: number;
};
export type QuoteLeg = {
  symbol: string;
  from: LiveAsset;
  to: LiveAsset;
  amount: string;
  route: Route;
  minimum: string;
  expected: string;
  gasUSD: number;
  feeUSD: number;
};
export type BasketQuote = {
  id: string;
  wallet: string;
  thesisId?: string;
  title: string;
  kind: "buy" | "sell" | "fund";
  chainId: number;
  budget: string;
  reserve: string;
  expiresAt: number;
  legs: QuoteLeg[];
};
export type JournalLeg = Omit<QuoteLeg, "route"> & {
  status:
    "ready" | "signing" | "pending" | "confirmed" | "attention" | "failed";
  route: Route | RouteExtended;
  received?: string;
  message?: string;
};
export type WalletOrder = Omit<BasketQuote, "legs"> & {
  createdAt: number;
  legs: JournalLeg[];
};

export function trackedHoldings(orders: WalletOrder[], thesisId: string) {
  const amounts = new Map<string, { asset: LiveAsset; amount: bigint }>();
  for (const order of orders) {
    if (order.thesisId !== thesisId || order.kind === "fund") continue;
    for (const leg of order.legs) {
      if (leg.status !== "confirmed") continue;
      const asset = order.kind === "buy" ? leg.to : leg.from;
      const key = `${asset.chainId}:${asset.address.toLowerCase()}`;
      const entry = amounts.get(key) ?? { asset, amount: 0n };
      entry.amount +=
        order.kind === "buy"
          ? BigInt(leg.received || "0")
          : -BigInt(leg.amount);
      amounts.set(key, entry);
    }
  }
  return [...amounts.values()]
    .filter((x) => x.amount > 0n)
    .map((x) => ({ ...x, amount: x.amount.toString() }));
}

export type BasketPlan = Omit<BasketQuote, "legs"> & {
  requiresClientQuotes: true;
  legs: { from: LiveAsset; to: LiveAsset; amount: string }[];
};
