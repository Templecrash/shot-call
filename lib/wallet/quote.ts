import type { LiveAsset } from "./networks";
import type { LiFiStep, Route } from "@lifi/sdk";

export async function fetchQuote(
  wallet: string,
  from: LiveAsset,
  to: LiveAsset,
  amount: string,
) {
  const params = new URLSearchParams({
    fromChain: String(from.chainId),
    toChain: String(to.chainId),
    fromToken: from.address,
    toToken: to.address,
    fromAmount: amount,
    fromAddress: wallet,
    toAddress: wallet,
    slippage: "0.005",
    integrator: "supertake",
    order: "RECOMMENDED",
  });
  const response = await fetch(`https://li.quest/v1/quote?${params}`, {
    signal: AbortSignal.timeout(25000),
    headers: { Accept: "application/json" },
  });
  const quote = (await response.json()) as LiFiStep & { message?: string };
  if (!response.ok)
    throw new Error(
      response.status === 429
        ? "Quote service is busy. Please try again shortly."
        : `No route for ${to.symbol} is available at this amount. ${quote.message?.slice(0, 180) || ""}`,
    );
  if (
    quote.action?.fromAddress?.toLowerCase() !== wallet.toLowerCase() ||
    quote.action.toAddress?.toLowerCase() !== wallet.toLowerCase() ||
    quote.action.fromChainId !== from.chainId ||
    quote.action.toChainId !== to.chainId ||
    quote.action.fromToken.address.toLowerCase() !==
      from.address.toLowerCase() ||
    quote.action.toToken.address.toLowerCase() !== to.address.toLowerCase() ||
    quote.action.fromAmount !== amount
  )
    throw new Error("Quote validation failed. Please request a new quote.");
  if (
    !/^\d+$/.test(quote.estimate.toAmountMin) ||
    BigInt(quote.estimate.toAmountMin) <= 0n
  )
    throw new Error("The quote has no minimum received amount.");
  // A single quote is already an executable LI.FI step; preserve all provider data.
  const route: Route = {
    id: quote.id,
    fromChainId: from.chainId,
    toChainId: to.chainId,
    fromAddress: wallet,
    toAddress: wallet,
    fromToken: quote.action.fromToken,
    toToken: quote.action.toToken,
    fromAmount: amount,
    fromAmountUSD: quote.estimate.fromAmountUSD || "0",
    toAmount: quote.estimate.toAmount,
    toAmountMin: quote.estimate.toAmountMin,
    toAmountUSD: quote.estimate.toAmountUSD || "0",
    gasCostUSD:
      quote.estimate.gasCosts
        ?.reduce((s, g) => s + Number(g.amountUSD || 0), 0)
        .toString() || "0",
    steps: [quote],
    insurance: { state: "NOT_INSURABLE", feeAmountUsd: "0" },
  };
  return {
    symbol: to.symbol,
    from,
    to,
    amount,
    route,
    minimum: quote.estimate.toAmountMin,
    expected: quote.estimate.toAmount,
    gasUSD: Number(route.gasCostUSD),
    feeUSD:
      quote.estimate.feeCosts?.reduce(
        (s, f) => s + Number(f.amountUSD || 0),
        0,
      ) || 0,
  };
}
