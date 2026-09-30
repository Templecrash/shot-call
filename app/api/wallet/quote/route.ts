import {externalStrategy} from '@/lib/external-strategy';
import {readThesis} from "@/lib/thesis-store";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import { assertWalletTradeReady } from "@/lib/wallet/trading-policy";
import { tokenFor } from "@/lib/token-catalog";
import { z } from "zod";
import { isAddress, BaseError, type Address } from "viem";
import { database } from "@/db/raw";
import { network, liveAsset, parseUsdc } from "@/lib/wallet/networks";
import { allocateBudget } from "@/lib/wallet/safety";
import { assetBalance } from "@/lib/wallet/server";
import { fetchQuote } from "@/lib/wallet/quote";

const input = z.object({
  prepareOnly: z.boolean().optional(),
  wallet: z.string().refine((v) => isAddress(v)),
  chainId: z
    .number()
    .int()
    .refine((v) => !!network(v)),
  kind: z.enum(["buy", "sell", "fund"]),
  amount: z.string().max(20).optional(),
  thesisId: z.string().max(80).optional(),
  toChainId: z.number().int().optional(),
  holdings: z
    .array(
      z.object({
        symbol: z.string().max(12),
        chainId: z.number().int(),
        amount: z.string().regex(/^\d{1,78}$/),
      }),
    )
    .max(12)
    .optional(),
});
export async function POST(req: Request) {
  try {
    if (
      req.headers.get("origin") &&
      new URL(req.headers.get("origin")!).host !== new URL(req.url).host
    )
      return Response.json({ error: "Invalid origin." }, { status: 403 });
    const b = input.parse(await req.json());
    assertWalletTradeReady(b.kind);
    const usdc = liveAsset("USDC", b.chainId)!;
    let title = "Move USDC",
      reserve = 0n,
      budget = 0n;
    let legs: { from: typeof usdc; to: typeof usdc; amount: string }[] = [];
    if (b.kind === "fund") {
      const to = liveAsset("USDC", b.toChainId || 0);
      if (!to || to.chainId === b.chainId)
        throw new Error("Choose two different supported networks.");
      budget = parseUsdc(b.amount || "");
      legs = [{ from: usdc, to, amount: budget.toString() }];
    } else {
      if (!b.thesisId) throw new Error("Choose a thesis first.");
      const user=await getChatGPTUser();
      const thesis=await readThesis(database(),b.thesisId,user?.userId);
      if (!thesis) throw new Error("This thesis is unavailable.");
      if(externalStrategy(thesis))throw new Error('This strategy contains paper shorts or external event shares. Live wallet execution is not connected.');
      if(b.kind==='buy'&&(thesis.closedAt||thesis.archivedAt))throw new Error('This take is closed to new investment.');
      title = thesis.title;
      if (b.kind === "buy") {
        budget = parseUsdc(b.amount || "");
        const unsupported = thesis.allocations.filter(
          (a) => a.weight > 0 && !liveAsset(a.symbol, b.chainId),
        );
        if (unsupported.length)
          throw new Error(
            `This wallet integration cannot buy ${unsupported.map((a) => tokenFor(thesis, a.symbol).symbol).join(", ")}. Fork the thesis to choose supported assets, or keep this basket in paper mode.`,
          );
        const allocation = allocateBudget(budget, thesis.allocations);
        legs = allocation.legs.map((l) => ({
          from: usdc,
          to: liveAsset(l.symbol, b.chainId)!,
          amount: l.amount.toString(),
        }));
        reserve = allocation.reserve;
      } else {
        const keys = new Set<string>();
        for (const h of b.holdings || []) {
          const asset = liveAsset(h.symbol, h.chainId);
          if (
            !asset ||
            asset.chainId !== h.chainId ||
            h.symbol === "USDC" ||
            !thesis.allocations.some((a) => a.symbol === h.symbol) ||
            BigInt(h.amount) <= 0n
          )
            throw new Error("Unsupported holding.");
          const key = `${h.chainId}:${h.symbol}`;
          if (keys.has(key)) throw new Error("Duplicate holding.");
          keys.add(key);
          legs.push({ from: asset, to: usdc, amount: h.amount });
        }
      }
    }
    if (!legs.length)
      throw new Error(
        "This basket has no tokens to swap. USDC stays in your wallet.",
      );
    if (b.kind !== "sell") {
      if ((await assetBalance(b.wallet as Address, usdc)) < budget)
        throw new Error(
          `Not enough USDC on ${network(b.chainId)!.name}. Fund this network or choose another balance.`,
        );
    } else {
      const balances = await Promise.all(
        legs.map((l) => assetBalance(b.wallet as Address, l.from)),
      );
      if (legs.some((l, i) => balances[i] < BigInt(l.amount)))
        throw new Error(
          "A token balance has changed. Your wallet no longer holds the requested amount.",
        );
    }
    if (b.prepareOnly)
      return Response.json(
        {
          id: crypto.randomUUID(),
          wallet: b.wallet,
          thesisId: b.thesisId,
          title,
          kind: b.kind,
          chainId: b.chainId,
          budget: budget.toString(),
          reserve: reserve.toString(),
          expiresAt: Date.now() + 60000,
          requiresClientQuotes: true,
          legs,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    const expiresAt = Date.now() + 60000;
    const quoted = [];
    // Keep provider load bounded and return no executable basket until every leg succeeds.
    for (const leg of legs)
      quoted.push(await fetchQuote(b.wallet, leg.from, leg.to, leg.amount));
    return Response.json(
      {
        id: crypto.randomUUID(),
        wallet: b.wallet,
        thesisId: b.thesisId,
        title,
        kind: b.kind,
        chainId: b.chainId,
        budget: budget.toString(),
        reserve: reserve.toString(),
        expiresAt,
        legs: quoted,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? "Check the wallet, network, and amount."
            : e instanceof BaseError
              ? "The network is currently busy. Please refresh your balances and request a new quote shortly."
              : e instanceof Error
                ? e.message
                : "Unable to quote this trade.",
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
