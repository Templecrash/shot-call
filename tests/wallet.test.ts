import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { encodeFunctionData, erc20Abi } from "viem";
import type { RouteExtended, Route } from "@lifi/sdk";
import {
  allocateBudget,
  validateRoute,
  validateTransaction,
  routeOutcome,
  unsettled,
} from "../lib/wallet/safety";
import { NETWORKS, liveAsset, parseUsdc } from "../lib/wallet/networks";
import {
  trackedHoldings,
  type QuoteLeg,
  type WalletOrder,
  type BasketQuote,
} from "../lib/wallet/types";
import {
  executeBasket,
  verifyAccount,
  switchNetwork,
  type BrowserProvider,
} from "../lib/wallet/browser";

const wallet = "0x1111111111111111111111111111111111111111",
  other = "0x2222222222222222222222222222222222222222",
  router = "0x3333333333333333333333333333333333333333";
const from = liveAsset("USDC", 8453)!,
  to = liveAsset("ETH", 8453)!;
function fixture(): QuoteLeg {
  const fromToken = { ...from, name: "USD Coin", priceUSD: "1" },
    toToken = { ...to, name: "ETH", priceUSD: "2000" };
  const step = {
    id: "step",
    type: "lifi",
    tool: "test",
    action: {
      fromAddress: wallet,
      toAddress: wallet,
      fromChainId: 8453,
      toChainId: 8453,
      fromToken,
      toToken,
      fromAmount: "90000000",
      slippage: 0.005,
    },
    estimate: {
      fromAmount: "90000000",
      toAmount: "45000000000000000",
      toAmountMin: "44000000000000000",
      approvalAddress: router,
      fromAmountUSD: "90",
      toAmountUSD: "90",
      executionDuration: 10,
    },
    transactionRequest: {
      from: wallet,
      to: router,
      chainId: 8453,
      data: "0x1234",
      value: "0",
    },
  };
  const route = {
    id: "route",
    fromChainId: 8453,
    toChainId: 8453,
    fromAddress: wallet,
    toAddress: wallet,
    fromToken,
    toToken,
    fromAmount: "90000000",
    fromAmountUSD: "90",
    toAmount: "45000000000000000",
    toAmountMin: "44000000000000000",
    toAmountUSD: "90",
    gasCostUSD: ".01",
    steps: [step],
    insurance: { state: "NOT_INSURABLE", feeAmountUsd: "0" },
  } as Route;
  return {
    symbol: "ETH",
    from,
    to,
    amount: "90000000",
    route,
    minimum: route.toAmountMin,
    expected: route.toAmount,
    gasUSD: 0.01,
    feeUSD: 0,
  };
}
function basket(legs = [fixture()]): BasketQuote {
  return {
    id: "basket",
    wallet,
    thesisId: "eth",
    title: "ETH",
    kind: "buy",
    chainId: 8453,
    budget: "100000000",
    reserve: "10000000",
    expiresAt: Date.now() + 60000,
    legs,
  };
}
function completed(leg: QuoteLeg, substatus = "COMPLETED"): RouteExtended {
  return {
    ...structuredClone(leg.route),
    steps: leg.route.steps.map((s) => ({
      ...s,
      execution: {
        startedAt: Date.now(),
        status: "DONE",
        toToken: s.action.toToken,
        toAmount: s.estimate.toAmount,
        actions: [
          {
            type: "SWAP",
            status: "DONE",
            substatus,
            chainId: 8453,
            txHash: `0x${"a".repeat(64)}`,
          },
        ],
      },
    })),
  } as RouteExtended;
}

test("USDC parsing preserves six decimals and rejects unsafe forms", () => {
  assert.equal(parseUsdc("123.000001"), 123000001n);
  assert.equal(parseUsdc("0.000001"), 1n);
  for (const input of [
    "0",
    "-1",
    "1e3",
    "Infinity",
    "NaN",
    "1.0000001",
    "0xFF",
    "",
    "9999999999",
    "1,000",
  ])
    assert.throws(() => parseUsdc(input));
});
test("basket allocation never spends rounding dust or USDC reserve", () => {
  const result = allocateBudget(1000001n, [
    { symbol: "ETH", weight: 33 },
    { symbol: "LINK", weight: 33 },
    { symbol: "ONDO", weight: 24 },
    { symbol: "USDC", weight: 10 },
  ]);
  assert.equal(
    result.legs.reduce((s, l) => s + l.amount, 0n) + result.reserve,
    1000001n,
  );
  assert.equal(result.reserve, 100001n);
  for (const weights of [
    [50, 40],
    [100, -1],
    [50.5, 49.5],
  ])
    assert.throws(() =>
      allocateBudget(
        100n,
        weights.map((weight, i) => ({ symbol: ["ETH", "LINK"][i], weight })),
      ),
    );
  assert.throws(() =>
    allocateBudget(100n, [
      { symbol: "ETH", weight: 50 },
      { symbol: "ETH", weight: 50 },
    ]),
  );
  assert.throws(() =>
    allocateBudget(1n, [
      { symbol: "ETH", weight: 50 },
      { symbol: "USDC", weight: 50 },
    ]),
  );
});
test("native assets are not silently replaced with wrapped namesakes", () => {
  for (const symbol of [
    "BTC",
    "SOL",
    "XMR",
    "ZEC",
    "RON",
    "PUMP",
    "INJ",
    "TAO",
    "NEAR",
    "RENDER",
  ])
    assert.equal(liveAsset(symbol, 8453), undefined);
  for (const n of NETWORKS)
    assert.equal(liveAsset("USDC", n.chain.id)?.address, n.usdc);
  assert.equal(liveAsset("USDC", 999), undefined);
  assert.equal(liveAsset("ETH", 137)?.chainId, 8453);
});
test("route guard rejects recipient, amount, token, network and minimum changes", () => {
  const leg = fixture();
  assert.doesNotThrow(() => validateRoute(leg.route, leg, wallet));
  const changes: ((route: Route) => void)[] = [
    (r) => {
      r.toAddress = other;
    },
    (r) => {
      r.steps[0].action.toAddress = other;
    },
    (r) => {
      r.fromAmount = "90000001";
    },
    (r) => {
      r.toToken.address = other;
    },
    (r) => {
      r.steps[0].action.fromToken.decimals = 18;
    },
    (r) => {
      r.steps[0].action.slippage = 0.01;
    },
    (r) => {
      r.steps[0].estimate.toAmountMin = "1";
    },
    (r) => {
      r.fromChainId = 1;
    },
  ];
  for (const change of changes) {
    const route = structuredClone(leg.route);
    change(route);
    assert.throws(() => validateRoute(route, leg, wallet));
  }
});
test("approvals are exact or resets, never unlimited or sent to another spender", () => {
  const leg = fixture();
  const approval = (amount: bigint, spender = router) => ({
    requestType: "approve",
    to: from.address,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender as `0x${string}`, amount],
    }),
  });
  assert.doesNotThrow(() =>
    validateTransaction(approval(90000000n), leg, wallet),
  );
  assert.doesNotThrow(() => validateTransaction(approval(0n), leg, wallet));
  assert.throws(() =>
    validateTransaction(approval(2n ** 256n - 1n), leg, wallet),
  );
  assert.throws(() => validateTransaction(approval(1n, other), leg, wallet));
  assert.throws(() =>
    validateTransaction(
      { requestType: "transaction", to: other, value: 0n },
      leg,
      wallet,
    ),
  );
  assert.throws(() =>
    validateTransaction(
      { requestType: "transaction", to: router, value: 1n },
      leg,
      wallet,
    ),
  );
});
test("partial/refunded settlements never become confirmed basket holdings", () => {
  const leg = fixture();
  assert.equal(routeOutcome(completed(leg), leg).status, "confirmed");
  for (const status of ["PARTIAL", "REFUNDED"])
    assert.equal(routeOutcome(completed(leg, status), leg).status, "attention");
  const bad = completed(leg);
  bad.steps[0].execution!.toToken = { ...bad.toToken, address: other };
  assert.equal(routeOutcome(bad, leg).status, "attention");
  const order = {
    ...basket(),
    createdAt: 1,
    legs: [
      { ...leg, status: "confirmed", received: "45000000000000000" },
      { ...leg, status: "pending" },
    ],
  } as WalletOrder;
  assert.equal(trackedHoldings([order], "eth")[0].amount, "45000000000000000");
  assert.equal(unsettled([order]), true);
  const sale = {
    ...order,
    kind: "sell",
    legs: [
      {
        ...leg,
        from: to,
        to: from,
        amount: "10000000000000000",
        status: "confirmed",
        received: "20000000",
      },
    ],
  } as WalletOrder;
  assert.equal(
    trackedHoldings([order, sale], "eth")[0].amount,
    "35000000000000000",
  );
});
test("changed account stops before a chain-switch or transaction request", async () => {
  const calls: string[] = [];
  const provider: BrowserProvider = {
    request: async (args) => {
      calls.push(args.method);
      return [other];
    },
  };
  await assert.rejects(verifyAccount(provider, wallet), /account changed/);
  await assert.rejects(switchNetwork(provider, wallet, 1), /account changed/);
  assert.deepEqual(calls, ["eth_accounts", "eth_accounts"]);
});
test("a failed second leg retains the first fill and never submits later legs", async () => {
  let calls = 0;
  const saved: WalletOrder[] = [];
  const sdk = mock.module("@lifi/sdk", {
    namedExports: {
      createClient: (x: unknown) => x,
      executeRoute: async (
        _client: unknown,
        route: Route,
        options: { updateRouteHook: (r: RouteExtended) => void },
      ) => {
        calls++;
        if (calls === 2) throw new Error("User rejected request");
        const result = completed({ ...fixture(), route });
        options.updateRouteHook(result);
        return result;
      },
    },
  });
  const ethereum = mock.module("@lifi/sdk-provider-ethereum", {
    namedExports: { EthereumProvider: (x: unknown) => x },
  });
  try {
    const order = await executeBasket(
      basket([fixture(), fixture(), fixture()]),
      { request: async () => [wallet] },
      (o) => saved.push(structuredClone(o)),
      () => true,
    );
    assert.equal(calls, 2);
    assert.deepEqual(
      order.legs.map((l) => l.status),
      ["confirmed", "failed", "failed"],
    );
    assert.equal(order.legs[0].received, "45000000000000000");
    assert.ok(saved.length >= 4);
  } finally {
    sdk.restore();
    ethereum.restore();
  }
});
test("expired quote does not load a signing provider or write an order", async () => {
  let requests = 0;
  await assert.rejects(
    executeBasket(
      { ...basket(), expiresAt: 0 },
      {
        request: async () => {
          requests++;
          return [wallet];
        },
      },
      () => assert.fail("must not persist"),
      () => true,
    ),
    /expired/,
  );
  assert.equal(requests, 0);
});

test("account switch after the first fill prevents any later leg from reaching the SDK", async () => {
  let calls = 0,
    account = wallet;
  const sdk = mock.module("@lifi/sdk", {
    namedExports: {
      createClient: (x: unknown) => x,
      executeRoute: async (_client: unknown, route: Route) => {
        calls++;
        account = other;
        return completed({ ...fixture(), route });
      },
    },
  });
  const ethereum = mock.module("@lifi/sdk-provider-ethereum", {
    namedExports: { EthereumProvider: (x: unknown) => x },
  });
  try {
    const order = await executeBasket(
      basket([fixture(), fixture()]),
      { request: async () => [account] },
      () => {},
      () => true,
    );
    assert.equal(calls, 1);
    assert.deepEqual(
      order.legs.map((l) => l.status),
      ["confirmed", "failed"],
    );
    assert.match(order.legs[1].message!, /account changed/);
  } finally {
    sdk.restore();
    ethereum.restore();
  }
});
test("ambiguous wallet submission remains blocked instead of being treated as safe to retry", async () => {
  const sent: string[] = [];
  const sdk = mock.module("@lifi/sdk", {
    namedExports: {
      createClient: (x: unknown) => x,
      executeRoute: async (
        client: {
          providers: {
            getWalletClient: () => Promise<{
              request: (args: unknown) => Promise<unknown>;
            }>;
          }[];
        },
        _route: Route,
      ) => {
        const walletClient = await client.providers[0].getWalletClient();
        await walletClient.request({
          method: "eth_sendTransaction",
          params: [{ from: wallet, to: router, data: "0x1234" }],
        });
      },
    },
  });
  const ethereum = mock.module("@lifi/sdk-provider-ethereum", {
    namedExports: { EthereumProvider: (x: unknown) => x },
  });
  const provider: BrowserProvider = {
    request: async ({ method }) => {
      if (method === "eth_accounts") return [wallet];
      if (method === "eth_chainId") return "0x2105";
      if (method === "eth_sendTransaction") {
        sent.push(method);
        throw new Error("Connection lost after submission");
      }
      throw new Error(method);
    },
  };
  try {
    const order = await executeBasket(
      basket(),
      provider,
      () => {},
      () => true,
    );
    assert.equal(sent.length, 1);
    assert.equal(order.legs[0].status, "attention");
    assert.equal(unsettled([order]), true);
  } finally {
    sdk.restore();
    ethereum.restore();
  }
});

test("a throttled Base RPC falls back without displaying a fabricated zero", async () => {
  const { assetBalance } = await import("../lib/wallet/server");
  const urls: string[] = [];
  const fetchMock = mock.method(
    globalThis,
    "fetch",
    async (input: string | URL | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      urls.push(url);
      return urls.length === 1
        ? new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              error: { code: -32005, message: "over rate limit" },
            }),
            { status: 429, headers: { "Content-Type": "application/json" } },
          )
        : new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: "0x" + 123000000n.toString(16).padStart(64, "0"),
            }),
            { headers: { "Content-Type": "application/json" } },
          );
    },
  );
  try {
    assert.equal(await assetBalance(wallet, from), 123000000n);
    assert.equal(urls.length, 2);
    assert.notEqual(urls[0], urls[1]);
  } finally {
    fetchMock.mock.restore();
  }
});
