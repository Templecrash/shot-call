import { decodeFunctionData, erc20Abi, type Address, type Hex } from "viem";
import type { Route, RouteExtended, TransactionParameters } from "@lifi/sdk";
import { liveAsset, NATIVE, type LiveAsset } from "./networks";
import type { JournalLeg, QuoteLeg, WalletOrder } from "./types";

const same = (a?: string, b?: string) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();
export function allocateBudget(
  budget: bigint,
  allocations: { symbol: string; weight: number }[],
) {
  if (
    !allocations.length ||
    allocations.some(
      (a) => !Number.isInteger(a.weight) || a.weight < 0 || a.weight > 100,
    ) ||
    new Set(allocations.map((a) => a.symbol)).size !== allocations.length ||
    allocations.reduce((s, a) => s + a.weight, 0) !== 100
  )
    throw new Error(
      "Allocations must be unique, whole percentages totaling 100%.",
    );
  const legs = allocations
    .filter((a) => a.symbol !== "USDC" && a.weight > 0)
    .map((a) => ({
      symbol: a.symbol,
      amount: (budget * BigInt(a.weight)) / 100n,
    }));
  if (legs.some((l) => l.amount <= 0n))
    throw new Error("The amount is too small for this allocation.");
  return { legs, reserve: budget - legs.reduce((s, l) => s + l.amount, 0n) };
}
export function validateRoute(
  route: Route | RouteExtended,
  leg: QuoteLeg,
  wallet: string,
) {
  const matches = (
    token: { address: string; chainId: number; decimals: number },
    asset: LiveAsset,
  ) =>
    same(token.address, asset.address) &&
    token.chainId === asset.chainId &&
    token.decimals === asset.decimals;
  if (
    !same(route.fromAddress, wallet) ||
    !same(route.toAddress, wallet) ||
    !matches(route.fromToken, leg.from) ||
    !matches(route.toToken, leg.to) ||
    route.fromAmount !== leg.amount ||
    route.fromChainId !== leg.from.chainId ||
    route.toChainId !== leg.to.chainId ||
    route.steps.length !== 1
  )
    throw new Error("Trade details changed. Request a fresh quote.");
  const step = route.steps[0];
  if (
    !same(step.action.fromAddress, wallet) ||
    !same(step.action.toAddress, wallet) ||
    !matches(step.action.fromToken, leg.from) ||
    !matches(step.action.toToken, leg.to) ||
    step.action.fromAmount !== leg.amount ||
    step.action.fromChainId !== leg.from.chainId ||
    step.action.toChainId !== leg.to.chainId ||
    !/^\d+$/.test(step.estimate.toAmountMin) ||
    BigInt(step.estimate.toAmountMin) < BigInt(leg.minimum) ||
    !Number.isFinite(step.action.slippage) ||
    step.action.slippage! < 0 ||
    step.action.slippage! > 0.005 ||
    !step.transactionRequest?.to
  )
    throw new Error(
      "The quote no longer meets the reviewed trade. Request a new quote.",
    );
}
export function validateTransaction(
  tx: TransactionParameters & { requestType: string },
  leg: QuoteLeg,
  wallet: string,
) {
  const step = leg.route.steps[0];
  if (tx.from && !same(tx.from, wallet))
    throw new Error("Wallet account changed.");
  if (tx.chainId && tx.chainId !== leg.from.chainId)
    throw new Error("Wallet network changed.");
  if (tx.requestType === "approve") {
    if (
      !same(tx.to, leg.from.address) ||
      leg.from.address === NATIVE ||
      BigInt(tx.value || 0) !== 0n
    )
      throw new Error("Unexpected token approval.");
    const decoded = decodeFunctionData({ abi: erc20Abi, data: tx.data as Hex });
    if (
      decoded.functionName !== "approve" ||
      !same(decoded.args[0] as Address, step.estimate.approvalAddress) ||
      (decoded.args[1] as bigint) > BigInt(leg.amount)
    )
      throw new Error("Approval exceeds the reviewed token amount.");
  } else if (
    !same(tx.to, step.transactionRequest?.to) ||
    BigInt(tx.value || 0) > BigInt(step.transactionRequest?.value || 0)
  )
    throw new Error(
      "Transaction destination or native fee changed. Request a fresh quote.",
    );
}
export function routeOutcome(
  route: RouteExtended,
  leg: QuoteLeg,
): Pick<JournalLeg, "status" | "received" | "message"> {
  const execution = route.steps[0]?.execution;
  if (!execution) return { status: "signing" };
  if (
    execution.actions.some(
      (a) => a.substatus === "PARTIAL" || a.substatus === "REFUNDED",
    )
  )
    return {
      status: "attention",
      message:
        "The route was refunded or delivered a different token. Check your wallet before trading again.",
    };
  if (execution.status === "DONE") {
    if (
      !same(execution.toToken?.address, leg.to.address) ||
      execution.toToken?.chainId !== leg.to.chainId ||
      !/^\d+$/.test(execution.toAmount || "") ||
      BigInt(execution.toAmount!) <= 0n
    )
      return {
        status: "attention",
        message: "Settlement needs verification. Check transaction status.",
      };
    return { status: "confirmed", received: execution.toAmount };
  }
  if (execution.actions.some((a) => a.txHash)) return { status: "pending" };
  return { status: "signing" };
}
export const unsettled = (orders: WalletOrder[]) =>
  orders.some((o) =>
    o.legs.some((l) => ["signing", "pending", "attention"].includes(l.status)),
  );
export function readJournal(wallet: string): WalletOrder[] {
  const raw = localStorage.getItem(
    `supertake:wallet:v1:${wallet.toLowerCase()}`,
  );
  if (!raw) return [];
  const orders = JSON.parse(raw) as WalletOrder[];
  if (
    !Array.isArray(orders) ||
    orders.some(
      (o) =>
        !o ||
        typeof o.wallet !== "string" ||
        !same(o.wallet, wallet) ||
        typeof o.title !== "string" ||
        !Number.isFinite(o.createdAt) ||
        !Array.isArray(o.legs) ||
        !o.id ||
        !["buy", "sell", "fund"].includes(o.kind) ||
        o.legs.some(
          (l) =>
            !l ||
            ![
              "ready",
              "signing",
              "pending",
              "confirmed",
              "attention",
              "failed",
            ].includes(l.status) ||
            typeof l.amount !== "string" ||
            !/^\d+$/.test(l.amount) ||
            (l.received && !/^\d+$/.test(l.received)) ||
            !l.from ||
            !l.to ||
            typeof l.to.address !== "string" ||
            !Number.isInteger(l.to.decimals) ||
            !liveAsset(l.from.symbol, l.from.chainId) ||
            !liveAsset(l.to.symbol, l.to.chainId) ||
            !Array.isArray(l.route?.steps) ||
            !l.route.steps.length,
        ),
    )
  )
    throw new Error(
      "Wallet activity could not be read. Restore your browser data before trading; your funds remain in your wallet.",
    );
  return orders;
}
