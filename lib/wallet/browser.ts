import {
  createWalletClient,
  custom,
  isAddress,
  toHex,
  type Address,
  type EIP1193Provider,
} from "viem";
import type { RouteExtended } from "@lifi/sdk";
import { network } from "./networks";
import { validateRoute, validateTransaction, routeOutcome } from "./safety";
import type { BasketQuote, WalletOrder, JournalLeg } from "./types";

export type BrowserProvider = {
  request: (args: {
    method: string;
    params?: unknown[] | object;
  }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => void;
};
export type DiscoveredWallet = {
  id: string;
  name: string;
  provider: BrowserProvider;
};
export async function verifyAccount(provider: BrowserProvider, wallet: string) {
  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as string[];
  if (!accounts[0] || accounts[0].toLowerCase() !== wallet.toLowerCase())
    throw new Error(
      "Wallet account changed. Reconnect and review a new quote.",
    );
}
export async function switchNetwork(
  provider: BrowserProvider,
  wallet: string,
  chainId: number,
) {
  await verifyAccount(provider, wallet);
  const n = network(chainId);
  if (!n) throw new Error("Unsupported network.");
  if (Number(await provider.request({ method: "eth_chainId" })) !== chainId) {
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: toHex(chainId) }],
      });
    } catch (e) {
      if ((e as { code?: number }).code !== 4902) throw e;
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: toHex(chainId),
            chainName: n.chain.name,
            nativeCurrency: n.chain.nativeCurrency,
            rpcUrls: n.chain.rpcUrls.default.http,
            blockExplorerUrls: [n.chain.blockExplorers.default.url],
          },
        ],
      });
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: toHex(chainId) }],
      });
    }
  }
  await verifyAccount(provider, wallet);
  if (Number(await provider.request({ method: "eth_chainId" })) !== chainId)
    throw new Error("Switch to the requested wallet network first.");
}
// This function is invoked only by the explicit review-screen confirmation.
export async function executeBasket(
  quote: BasketQuote,
  provider: BrowserProvider,
  persist: (order: WalletOrder) => void,
  isCurrent: () => boolean,
) {
  if (Date.now() >= quote.expiresAt)
    throw new Error("This quote expired. Request a fresh quote.");
  quote.legs.forEach((leg) => validateRoute(leg.route, leg, quote.wallet));
  await verifyAccount(provider, quote.wallet);
  const [{ createClient, executeRoute }, { EthereumProvider }] =
    await Promise.all([
      import("@lifi/sdk"),
      import("@lifi/sdk-provider-ethereum"),
    ]);
  const order: WalletOrder = {
    ...quote,
    createdAt: Date.now(),
    legs: quote.legs.map((leg) => ({ ...leg, status: "ready" })),
  };
  const save = () => persist(structuredClone(order));
  let index = 0,
    attempted = false;
  const assertCurrent = async () => {
    if (!isCurrent()) throw new Error("Wallet disconnected or changed.");
    await verifyAccount(provider, quote.wallet);
  };
  const guarded: BrowserProvider = {
    request: async (args) => {
      // Use individual transactions. No message signing, batching, or account upgrades.
      if (args.method === "wallet_getCapabilities") return {};
      if (
        args.method === "wallet_sendCalls" ||
        /sign|sendRawTransaction/i.test(args.method)
      )
        throw new Error(
          "This flow requires individual wallet transaction confirmations.",
        );
      if (args.method === "eth_sendTransaction") {
        await assertCurrent();
        if (
          Number(await provider.request({ method: "eth_chainId" })) !==
          quote.legs[index].from.chainId
        )
          throw new Error("Wallet network changed.");
        const tx = (args.params as Record<string, unknown>[])[0];
        if (
          typeof tx.from !== "string" ||
          !isAddress(tx.from) ||
          tx.from.toLowerCase() !== quote.wallet.toLowerCase()
        )
          throw new Error("Unexpected transaction account.");
        attempted = true;
        order.legs[index].status = "signing";
        save();
      }
      return provider.request(args);
    },
  };
  const getClient = async (chainId: number) => {
    await assertCurrent();
    await switchNetwork(provider, quote.wallet, chainId);
    return createWalletClient({
      account: quote.wallet as Address,
      chain: network(chainId)!.chain,
      transport: custom(guarded as EIP1193Provider, { retryCount: 0 }),
    });
  };
  const client = createClient({
    integrator: "supertake",
    providers: [
      EthereumProvider({
        disableMessageSigning: true,
        getWalletClient: () => getClient(quote.legs[index].from.chainId),
        switchChain: getClient,
      }),
    ],
  });
  save();
  for (index = 0; index < quote.legs.length; index++) {
    const leg = quote.legs[index];
    attempted = false;
    try {
      await assertCurrent();
      order.legs[index].status = "signing";
      save();
      const result = await executeRoute(client, structuredClone(leg.route), {
        acceptExchangeRateUpdateHook: async () => false,
        updateTransactionRequestHook: async (tx) => {
          await assertCurrent();
          validateRoute(order.legs[index].route, leg, quote.wallet);
          validateTransaction(tx, leg, quote.wallet);
          return tx;
        },
        updateRouteHook: (route) => {
          const outcome = routeOutcome(route, leg);
          order.legs[index] = {
            ...order.legs[index],
            route: structuredClone(route),
            ...outcome,
          };
          save();
        },
      });
      const outcome = routeOutcome(result, leg);
      order.legs[index] = { ...order.legs[index], route: result, ...outcome };
      save();
      if (outcome.status !== "confirmed") break;
    } catch (e) {
      const l = order.legs[index],
        hasHash = (l.route as RouteExtended).steps.some((s) =>
          s.execution?.actions.some((a) => a.txHash),
        );
      const rejected =
        (e as { code?: number }).code === 4001 ||
        /user rejected|user denied/i.test(e instanceof Error ? e.message : "");
      l.status = hasHash
        ? "pending"
        : attempted && !rejected
          ? "attention"
          : "failed";
      l.message = rejected
        ? "You declined the wallet request. No further trades were submitted."
        : e instanceof Error
          ? e.message
              .split("\n")[0]
              .replace(/^\[[^\]]+\]\s*/, "")
              .slice(0, 180)
          : "The wallet transaction did not complete.";
      save();
      break;
    }
  }
  // Never silently replay an unfinished basket after an error or reload.
  order.legs = order.legs.map((l) =>
    l.status === "ready"
      ? {
          ...l,
          status: "failed",
          message: "Not submitted. Earlier legs are shown separately.",
        }
      : l,
  );
  save();
  return order;
}

export async function checkLeg(leg: JournalLeg): Promise<JournalLeg> {
  const step = (leg.route as RouteExtended).steps[0];
  const action = step.execution?.actions.find(
    (a) => ["SWAP", "CROSS_CHAIN"].includes(a.type) && a.txHash,
  );
  if (!action?.txHash)
    throw new Error(
      "No swap hash was recorded. Check the connected wallet’s activity before dismissing this entry.",
    );
  const { createClient, getStatus } = await import("@lifi/sdk");
  const status = await getStatus(createClient({ integrator: "supertake" }), {
    txHash: action.txHash,
    fromChain: leg.from.chainId,
    toChain: leg.to.chainId,
    bridge: step.tool,
  });
  if (
    status.status === "DONE" &&
    status.substatus === "COMPLETED" &&
    "receiving" in status &&
    "token" in status.receiving &&
    status.receiving.token &&
    status.receiving.token.address.toLowerCase() ===
      leg.to.address.toLowerCase() &&
    status.receiving.token.chainId === leg.to.chainId &&
    "amount" in status.receiving &&
    status.receiving.amount &&
    /^\d+$/.test(status.receiving.amount) &&
    BigInt(status.receiving.amount) > 0n
  )
    return {
      ...leg,
      status: "confirmed",
      received: status.receiving.amount,
      message: undefined,
    };
  if (status.status === "FAILED")
    return {
      ...leg,
      status: "failed",
      message: "The transaction failed. Check the explorer for gas costs.",
    };
  return {
    ...leg,
    status: status.status === "DONE" ? "attention" : "pending",
    message:
      status.substatusMessage ||
      "Settlement is still being checked. Do not resubmit this trade.",
  };
}
