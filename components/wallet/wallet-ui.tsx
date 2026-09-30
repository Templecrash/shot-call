"use client";
import { TokenIconImage } from "@/components/token-icon";
import { PositionPnl } from "@/components/position-pnl";
import { useWalletPerformance } from "./use-wallet-performance";
import { useEffect, useState } from "react";
import {
  WALLET_TRADE_FEES_READY,
  WALLET_TRADE_SETUP_MESSAGE,
} from "@/lib/wallet/trading-policy";
import { InvestmentAmount } from "@/components/investment-amount";
import { parseCents } from "@/lib/trading-fees";
import { formatUnits } from "viem";
import { QRCodeSVG } from "qrcode.react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWallet } from "./wallet-provider";
import { fetchQuote } from "@/lib/wallet/quote";
import {
  NETWORKS,
  network,
  shortAddress,
  usd,
  liveAsset,
} from "@/lib/wallet/networks";
import {
  trackedHoldings,
  type BasketQuote,
  type BasketPlan,
  type WalletOrder,
} from "@/lib/wallet/types";
import type { RouteExtended } from "@lifi/sdk";
import { TOKENS, type Thesis } from "@/lib/data";
import { tokenFor } from "@/lib/token-catalog";

const money = (value: string) => usd(Number(formatUnits(BigInt(value), 6)));
const quantity = (value: string, decimals: number) =>
  Number(formatUnits(BigInt(value), decimals)).toLocaleString("en-US", {
    maximumSignificantDigits: 7,
  });
function ChainDot({ id }: { id: number }) {
  return (
    <span
      className="chain-dot"
      style={{ background: network(id)?.color }}
      aria-hidden="true"
    >
      {network(id)?.name.slice(0, 1)}
    </span>
  );
}
function TokenIcon({ symbol }: { symbol: string }) {
  return <TokenIconImage className="wallet-token-icon" width={23} height={23} token={tokenFor(undefined,symbol)} symbol={symbol} alt=""/>;
}
function totalBalance(balances: ReturnType<typeof useWallet>["balances"]) {
  return balances?.balances.some((b) => b.amount !== null)
    ? balances.balances
        .reduce((s, b) => s + BigInt(b.amount || "0"), 0n)
        .toString()
    : null;
}
export function WalletHeader() {
  const w = useWallet(),
    total = totalBalance(w.balances);
  return (
    <>
      <div className="wallet-mode" aria-label="Trading mode">
        <button
          aria-pressed={w.mode === "paper"}
          onClick={() => w.setMode("paper")}
        >
          Paper
        </button>
        <button
          aria-pressed={w.mode === "wallet"}
          onClick={() => w.setMode("wallet")}
        >
          Wallet
        </button>
      </div>
      <button
        className={`wallet-connect ${w.address ? "is-connected" : ""}`}
        onClick={() => w.setOpen(true)}
      >
        <Wallet size={15} />
        <span>
          {w.address
            ? total !== null
              ? `${w.balances?.balances.some((b) => b.amount === null) ? "≥ " : ""}${money(total)}`
              : shortAddress(w.address)
            : "Connect wallet"}
        </span>
        {w.address && <i />}
      </button>
      <WalletDialog />
    </>
  );
}
function NetworkSelect({
  value,
  onChange,
  label = "Funding network",
}: {
  value: number;
  onChange: (id: number) => void;
  label?: string;
}) {
  const w = useWallet();
  return (
    <label className="wallet-field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {NETWORKS.map((n) => {
          const b = w.balances?.balances.find((b) => b.chainId === n.chain.id);
          return (
            <option key={n.chain.id} value={n.chain.id}>
              {n.name}
              {w.address
                ? ` · ${b?.amount != null ? money(b.amount) : "unavailable"}`
                : ""}
            </option>
          );
        })}
      </select>
    </label>
  );
}
function BalanceSummary() {
  const w = useWallet(),
    total = totalBalance(w.balances),
    partial = w.balances?.balances.some((b) => b.amount === null);
  return (
    <div className="wallet-balance-summary">
      <span>Available USDC</span>
      <strong>
        {total === null ? "—" : `${partial ? "≥ " : ""}${money(total)}`}
      </strong>
      <small>
        {w.loading
          ? "Refreshing networks…"
          : partial
            ? "Some networks unavailable · known balances shown"
            : "Across 6 networks · USD at $1 per USDC"}
      </small>
    </div>
  );
}
export function WalletDialog() {
  const w = useWallet(),
    [tab, setTab] = useState("receive");
  const selected = network(w.chainId)!;
  async function copy() {
    if (!w.address) return;
    try {
      await navigator.clipboard.writeText(w.address);
      toast.success("Your wallet address copied.");
    } catch {
      toast.error("Select and copy the address below.");
    }
  }
  return (
    <Dialog open={w.open} onOpenChange={w.setOpen}>
      <DialogContent className="app-dialog wallet-dialog">
        <DialogTitle>
          {w.address ? "Your conviction starts here." : "Bring your wallet."}
        </DialogTitle>
        <DialogDescription>
          {w.address
            ? `${w.providerName} · ${shortAddress(w.address)}`
            : "Connect a browser wallet to fund and trade your takes."}
        </DialogDescription>
        {!w.address ? (
          <>
            <div className="wallet-intro-icon">
              <Wallet size={30} />
              <span>YOUR KEYS. YOUR CONVICTION.</span>
            </div>
            <div className="wallet-options">
              {w.wallets.map((wallet) => (
                <button
                  className="outline"
                  key={wallet.id}
                  disabled={w.connecting}
                  onClick={() => w.connect(wallet)}
                >
                  <Wallet size={18} />
                  {wallet.name}
                  {w.connecting ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>
              ))}
              {!w.wallets.length && (
                <div className="wallet-empty">
                  <h3>No browser wallet found.</h3>
                  <p>
                    Open this site in a browser with MetaMask, Rabby, Coinbase
                    Wallet, or another Ethereum wallet extension.
                  </p>
                  <button
                    className="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(location.href);
                        toast.success(
                          "Link copied. Open it in your wallet browser.",
                        );
                      } catch {
                        toast.error("Copy the page URL from your browser.");
                      }
                    }}
                  >
                    <Copy size={14} /> Copy site link
                  </button>
                </div>
              )}
            </div>
            <p className="small-muted">
              Connecting shares your public address. Transfers and trades
              require confirmation in your wallet. QR wallet connections aren’t
              available yet. Use a browser wallet.
            </p>
          </>
        ) : (
          <>
            <div className="wallet-summary-row">
              <BalanceSummary />
              <button
                className="icon-button"
                aria-label="Refresh wallet balances"
                disabled={w.loading}
                onClick={() => w.refresh()}
              >
                <RefreshCw size={17} className={w.loading ? "spin" : ""} />
              </button>
            </div>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="trade-tabs">
                <TabsTrigger value="receive">Add USDC</TabsTrigger>
                <TabsTrigger value="networks">Networks</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>
            </Tabs>
            {tab === "receive" && (
              <>
                <NetworkSelect
                  value={w.chainId}
                  onChange={w.setChainId}
                  label="Receive on"
                />
                <div className="receive-box">
                  <div className="wallet-qr">
                    <QRCodeSVG
                      value={w.address}
                      size={130}
                      marginSize={0}
                      title="Connected wallet address"
                    />
                  </div>
                  <div>
                    <ChainDot id={w.chainId} />
                    <h3>USDC on {selected.name}</h3>
                    <p>
                      Send native USDC to your connected wallet. The balance
                      updates after confirmation.
                    </p>
                    <a
                      href={`${selected.chain.blockExplorers.default.url}/token/${selected.usdc}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Verify USDC contract <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
                <div className="wallet-address">
                  <input
                    aria-label="Your deposit wallet address"
                    value={w.address}
                    readOnly
                  />
                  <button aria-label="Copy wallet address" onClick={copy}>
                    <Copy size={17} />
                  </button>
                </div>
                <div className="wallet-notice">
                  Choose <b>{selected.name}</b> in the sending app. This QR
                  contains your address; it does not select a network. Use
                  native USDC, not USDC.e.
                </div>
                <p className="small-muted">
                  Keep a little {selected.chain.nativeCurrency.symbol} on{" "}
                  {selected.name} for transaction fees. Funds go directly to
                  your wallet.
                </p>
              </>
            )}
            {tab === "networks" && (
              <div className="network-balances">
                {NETWORKS.map((n) => {
                  const b = w.balances?.balances.find(
                    (b) => b.chainId === n.chain.id,
                  );
                  return (
                    <button
                      key={n.chain.id}
                      onClick={() => {
                        w.setChainId(n.chain.id);
                        setTab("receive");
                      }}
                    >
                      <ChainDot id={n.chain.id} />
                      <div>
                        <b>{n.name}</b>
                        <small>
                          {b?.nativeAmount != null
                            ? `${quantity(b.nativeAmount, 18)} ${n.chain.nativeCurrency.symbol} for gas`
                            : "Balance unavailable"}
                        </small>
                      </div>
                      <strong>
                        {b?.amount != null ? money(b.amount) : "—"}
                      </strong>
                      <ArrowDownLeft size={15} />
                    </button>
                  );
                })}
              </div>
            )}
            {tab === "activity" && <OrderActivity orders={w.orders} />}
            <div className="wallet-bottom">
              <a
                href={`${selected.chain.blockExplorers.default.url}/address/${w.address}`}
                target="_blank"
                rel="noreferrer"
              >
                View wallet <ExternalLink size={12} />
              </a>
              <button disabled={w.busy} onClick={w.disconnect}>
                Disconnect
              </button>
            </div>
          </>
        )}
        {w.error && (
          <p className="form-error" role="alert">
            {w.error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function LiveTradePanel({
  thesis,
  onFork,
}: {
  thesis: Thesis;
  onFork: () => void;
}) {
  const w = useWallet(),
    [side, setSide] = useState("buy"),
    [amount, setAmount] = useState("100"),
    [sellPercent, setSellPercent] = useState(100),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [quote, setQuote] = useState<BasketQuote | null>(null);
  const unsupported = thesis.allocations.filter(
    (a) => a.weight > 0 && !liveAsset(a.symbol, w.chainId),
  );
  const holdings = trackedHoldings(w.orders, thesis.id),
    balance = w.balances?.balances.find((b) => b.chainId === w.chainId),
    orders = w.orders.filter((o) => o.thesisId === thesis.id);
  async function review() {
    setError("");
    setLoading(true);
    try {
      const r = await fetch("/api/wallet/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prepareOnly: true,
          wallet: w.address,
          chainId: w.chainId,
          kind: side,
          amount,
          thesisId: thesis.id,
          holdings:
            side === "sell"
              ? holdings.map((h) => ({
                  symbol: h.asset.symbol,
                  chainId: h.asset.chainId,
                  amount: (
                    (BigInt(h.amount) * BigInt(sellPercent)) /
                    100n
                  ).toString(),
                }))
              : undefined,
        }),
      });
      const data = (await r.json()) as (BasketQuote | BasketPlan) & {
        error?: string;
      };
      if (!r.ok) throw new Error(data.error || "No quote available.");
      if ("requiresClientQuotes" in data) {
        const quotedLegs = [];
        for (const leg of data.legs)
          quotedLegs.push(
            await fetchQuote(data.wallet, leg.from, leg.to, leg.amount),
          );
        setQuote({ ...data, legs: quotedLegs });
      } else setQuote(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to get a quote.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="live-trade">
      <div className="trade-box">
        <span className="eyebrow">
          <i className="live-dot" /> YOUR WALLET. YOUR CONVICTION.
        </span>
        <h3>
          Put your capital <br />
          behind your take.
        </h3>
        <p>Use your USDC. Hold the tokens in your wallet.</p>
        <Tabs
          value={side}
          onValueChange={(v) => {
            setSide(v);
            setError("");
          }}
        >
          <TabsList className="trade-tabs">
            <TabsTrigger value="buy">Buy take</TabsTrigger>
            <TabsTrigger value="sell" disabled={!holdings.length}>
              Sell holdings
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <NetworkSelect
          value={w.chainId}
          onChange={w.setChainId}
          label={side === "buy" ? "Pay with USDC on" : "Receive USDC on"}
        />
        {side === "buy" ? (
          <>
            <InvestmentAmount
              value={amount}
              onChange={setAmount}
              available={
                balance?.amount != null
                  ? Number(BigInt(balance.amount) / 10000n)
                  : null
              }
              currency="USDC"
              label="Investment amount"
              balanceLabel={`${network(w.chainId)?.name || "Network"} USDC available`}
              disabled={loading || w.busy}
            />
            <button
              className="text-button wallet-funding-link"
              onClick={() => w.setOpen(true)}
            >
              Add funds <PlusIcon />
            </button>
          </>
        ) : (
          <>
            <p className="small-muted">
              Sell tokens acquired through this browser. Current on-chain
              balances are checked before quoting.
            </p>
            <div className="quick-amounts">
              {[25, 50, 100].map((n) => (
                <button
                  className={sellPercent === n ? "selected" : ""}
                  key={n}
                  onClick={() => setSellPercent(n)}
                >
                  {n === 100 ? "Sell all" : `${n}%`}
                </button>
              ))}
            </div>
            {holdings.map((h) => (
              <div
                className="wallet-holding-amount"
                key={`${h.asset.chainId}:${h.asset.symbol}`}
              >
                <TokenIcon symbol={h.asset.symbol} />
                <span>
                  {h.asset.symbol}{" "}
                  <small>{network(h.asset.chainId)?.name}</small>
                </span>
                <b>
                  {quantity(
                    (BigInt(h.amount) * BigInt(sellPercent)) / 100n + "",
                    h.asset.decimals,
                  )}
                </b>
              </div>
            ))}
          </>
        )}
        {unsupported.length > 0 && side === "buy" && (
          <div className="wallet-notice">
            <b>
              {unsupported
                .map((a) => tokenFor(thesis, a.symbol).symbol)
                .join(", ")}{" "}
              {unsupported.length === 1 ? "is" : "are"} not supported for wallet
              trading yet.
            </b>
            <p>
              Fork this take and adjust the basket to supported assets, or
              explore it with paper funds.
            </p>
            <button className="text-button" onClick={onFork}>
              Adjust this basket <ArrowUpRight size={13} />
            </button>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {w.blocked && (
          <p className="wallet-notice">
            A previous transaction needs review. Open wallet activity before
            trading again.{" "}
            <button className="text-button" onClick={() => w.setOpen(true)}>
              Open wallet
            </button>
          </p>
        )}
        <button
          className="dark wide"
          disabled={
            loading ||
            w.busy ||
            (!!w.address &&
              (!WALLET_TRADE_FEES_READY ||
                w.blocked ||
                (side === "buy" &&
                  (unsupported.length > 0 ||
                    balance?.amount == null ||
                    parseCents(amount) === null ||
                    (parseCents(amount) ?? 0) <= 0 ||
                    BigInt(parseCents(amount) ?? 0) * 10000n >
                      BigInt(balance.amount))) ||
                (side === "sell" && !holdings.length)))
          }
          onClick={() => (w.address ? review() : w.setOpen(true))}
        >
          {loading ? (
            <>
              <Loader2 size={16} className="spin" /> Finding routes…
            </>
          ) : w.busy ? (
            "Trade in progress…"
          ) : w.address ? (
            WALLET_TRADE_FEES_READY ? (
              "Review trade"
            ) : (
              "Wallet trading coming soon"
            )
          ) : (
            "Connect wallet"
          )}
          {!loading && !w.busy && <ArrowUpRight size={16} />}
        </button>
        <p className="trading-fee-footnote">
          {WALLET_TRADE_FEES_READY
            ? "0.05% entry fee and the take’s platform performance fee, plus network and route fees."
            : WALLET_TRADE_SETUP_MESSAGE}
        </p>
        <div className="wallet-exit-note">
          Automated take profit and stop loss aren’t active for wallet holdings.
          Exit manually here.
        </div>
        <button className="text-button" onClick={() => w.setMode("paper")}>
          Explore with paper funds
        </button>
      </div>
      {orders.length > 0 && <OrderActivity orders={orders.slice(0, 3)} />}
      {quote && (
        <QuoteReview
          key={quote.id}
          quote={quote}
          onClose={() => setQuote(null)}
        />
      )}
    </div>
  );
}
function PlusIcon() {
  return <span aria-hidden="true">+</span>;
}
function QuoteReview({
  quote,
  onClose,
}: {
  quote: BasketQuote | null;
  onClose: () => void;
}) {
  const w = useWallet(),
    [error, setError] = useState(""),
    [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [quote?.id]);
  const activeOrder = w.orders.find((o) => o.id === quote?.id);
  const valid =
      !!quote && w.address?.toLowerCase() === quote.wallet.toLowerCase(),
    expired = !!quote && now >= quote.expiresAt;
  async function confirm() {
    if (!quote) return;
    setError("");
    try {
      await w.execute(quote);
      onClose();
      toast("Wallet activity updated. Check each token’s status.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Trade could not be submitted.",
      );
    }
  }
  return (
    <Dialog open={!!quote} onOpenChange={(v) => !v && !w.busy && onClose()}>
      <DialogContent
        className="app-dialog quote-dialog"
        showCloseButton={!w.busy}
        onPointerDownOutside={(e) => w.busy && e.preventDefault()}
        onEscapeKeyDown={(e) => w.busy && e.preventDefault()}
      >
        <DialogTitle>Review your conviction.</DialogTitle>
        <DialogDescription>
          {quote?.title} · Real wallet {quote?.kind}
        </DialogDescription>
        {quote && (
          <>
            <div className="quote-total">
              <span>
                {quote.kind === "buy" ? "USDC budget" : "Minimum USDC received"}
              </span>
              <strong>
                {quote.kind === "buy"
                  ? money(quote.budget)
                  : money(
                      quote.legs
                        .reduce((s, l) => s + BigInt(l.minimum), 0n)
                        .toString(),
                    )}
              </strong>
              <small>
                {network(quote.chainId)?.name} · {shortAddress(quote.wallet)}
              </small>
            </div>
            <div className="quote-legs">
              {quote.legs.map((l, i) => (
                <div key={i}>
                  <TokenIcon
                    symbol={quote.kind === "buy" ? l.to.symbol : l.from.symbol}
                  />
                  <div>
                    <b>{quote.kind === "buy" ? l.to.symbol : l.from.symbol}</b>
                    <small>
                      {network(l.from.chainId)?.name} →{" "}
                      {network(l.to.chainId)?.name}
                    </small>
                    <small>
                      Minimum {quantity(l.minimum, l.to.decimals)} {l.to.symbol}
                    </small>
                    {activeOrder && (
                      <small>{activeOrder.legs[i]?.status}</small>
                    )}
                  </div>
                  <strong>
                    {quantity(l.amount, l.from.decimals)}
                    <small>{l.from.symbol}</small>
                  </strong>
                </div>
              ))}
            </div>
            <div className="quote-facts">
              {BigInt(quote.reserve) > 0n && (
                <div>
                  <span>USDC kept in your wallet</span>
                  <b>{money(quote.reserve)}</b>
                </div>
              )}
              <div>
                <span>Estimated network fees</span>
                <b>{usd(quote.legs.reduce((s, l) => s + l.gasUSD, 0))}</b>
              </div>
              <div>
                <span>Route fees (included)</span>
                <b>{usd(quote.legs.reduce((s, l) => s + l.feeUSD, 0))}</b>
              </div>
              <div>
                <span>Maximum slippage</span>
                <b>0.5%</b>
              </div>
              <div>
                <span>Quote expires</span>
                <b>
                  {w.busy
                    ? "In progress"
                    : expired
                      ? "Expired"
                      : `${Math.max(0, Math.ceil((quote.expiresAt - now) / 1000))}s`}
                </b>
              </div>
            </div>
            <div className="wallet-notice">
              {quote.legs.length > 1
                ? "This basket uses separate transactions. If one stops, completed trades remain in your wallet. "
                : ""}
              Keep native gas on each source network. Token approvals are
              limited to each trade amount.
            </div>
            <p className="small-muted">
              Any USDC reserve remains freely available in your wallet. It is
              not locked to this thesis. Keep this page open until the wallet
              activity updates.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {!valid && (
              <p className="form-error">
                Wallet changed. Close this review and request a new quote.
              </p>
            )}
            <button
              className="dark wide"
              disabled={
                w.busy ||
                expired ||
                !valid ||
                w.blocked ||
                (quote.kind !== "fund" && !WALLET_TRADE_FEES_READY)
              }
              onClick={confirm}
            >
              {w.busy ? (
                <>
                  <Loader2 size={16} className="spin" />{" "}
                  {activeOrder?.legs.some((l) => l.status === "pending")
                    ? "Waiting for on-chain confirmation…"
                    : "Confirm in your wallet…"}
                </>
              ) : expired ? (
                "Quote expired — request another"
              ) : (
                "Confirm in wallet"
              )}
              {!w.busy && !expired && <Wallet size={16} />}
            </button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function OrderActivity({ orders }: { orders: WalletOrder[] }) {
  const w = useWallet(),
    [dismissId, setDismissId] = useState<string | null>(null),
    [error, setError] = useState("");
  return (
    <div className="wallet-activity">
      <div className="wallet-activity-heading">
        <h3>Wallet activity</h3>
        <span>Saved in this browser</span>
      </div>
      {!orders.length && (
        <p className="small-muted">
          Your wallet trades will appear here. Deposits are reflected in your
          USDC balance.
        </p>
      )}
      {orders.map((o) => {
        const pending = o.legs.some((l) =>
            ["signing", "pending", "attention"].includes(l.status),
          ),
          complete = o.legs.every((l) => l.status === "confirmed");
        return (
          <article key={o.id}>
            <div className="wallet-order-title">
              <div>
                <b>
                  {o.kind === "buy"
                    ? "Buy"
                    : o.kind === "sell"
                      ? "Sell"
                      : "Move"}{" "}
                  · {o.title}
                </b>
                <small>{new Date(o.createdAt).toLocaleString()}</small>
              </div>
              <span className={`wallet-status ${complete ? "confirmed" : ""}`}>
                {complete
                  ? "Completed"
                  : pending
                    ? "Needs review"
                    : o.legs.some((l) => l.status === "confirmed")
                      ? "Partially completed"
                      : "Not completed"}
              </span>
            </div>
            {o.legs.map((l, i) => {
              const actions = (l.route as RouteExtended).steps
                .flatMap((s) => s.execution?.actions || [])
                .filter((a) => a.txHash);
              return (
                <div className="wallet-leg-status" key={i}>
                  <div>
                    <TokenIcon
                      symbol={o.kind === "sell" ? l.from.symbol : l.to.symbol}
                    />
                    <b>{o.kind === "sell" ? l.from.symbol : l.to.symbol}</b>
                    <span>
                      {l.status === "confirmed" ? (
                        <>
                          <Check size={12} /> Confirmed
                        </>
                      ) : l.status === "ready" ? (
                        "Not submitted"
                      ) : (
                        l.status
                      )}
                    </span>
                  </div>
                  {l.received && (
                    <small>
                      Received {quantity(l.received, l.to.decimals)}{" "}
                      {l.to.symbol}
                    </small>
                  )}
                  {l.message && <p>{l.message}</p>}
                  {actions.map((a, j) =>
                    network(a.chainId || 0) &&
                    /^0x[0-9a-f]{64}$/i.test(a.txHash!) ? (
                      <a
                        key={j}
                        href={`${network(a.chainId!)!.chain.blockExplorers.default.url}/tx/${a.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {a.type === "SET_ALLOWANCE"
                          ? "Approval"
                          : "Transaction"}{" "}
                        on {network(a.chainId!)?.name}{" "}
                        <ExternalLink size={10} />
                      </a>
                    ) : null,
                  )}
                </div>
              );
            })}
            {pending && (
              <div className="wallet-activity-actions">
                <button
                  className="outline"
                  disabled={w.busy}
                  onClick={async () => {
                    setError("");
                    try {
                      await w.check(o.id);
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : "Unable to check settlement.",
                      );
                    }
                  }}
                >
                  <RefreshCw size={13} /> Check status
                </button>
                <button disabled={w.busy} onClick={() => setDismissId(o.id)}>
                  Review manually
                </button>
              </div>
            )}
          </article>
        );
      })}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Dialog open={!!dismissId} onOpenChange={(v) => !v && setDismissId(null)}>
        <DialogContent className="app-dialog">
          <DialogTitle>Check your wallet first.</DialogTitle>
          <DialogDescription>
            Dismiss tracking only after reviewing your wallet’s transaction
            history and token balances.
          </DialogDescription>
          <p>
            A pending transaction can still complete. Dismissing does not cancel
            it, refund it, or add unverified tokens to your holdings. Starting
            the same trade again could spend more USDC.
          </p>
          <button className="outline wide" onClick={() => setDismissId(null)}>
            Keep tracking
          </button>
          <button
            className="dark wide"
            onClick={() => {
              if (dismissId) w.dismiss(dismissId);
              setDismissId(null);
            }}
          >
            I’ve checked my wallet — dismiss tracking
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
export function WalletPortfolio({
  theses,
  onOpen,
}: {
  theses: Thesis[];
  onOpen: (id: string) => void;
}) {
  const w = useWallet();
  const { performance, refreshing } = useWalletPerformance(w.orders, w.address);
  const holdings = theses
    .map((t) => ({ t, assets: trackedHoldings(w.orders, t.id) }))
    .filter((h) => h.assets.length);
  return (
    <section className="portfolio wallet-portfolio">
      <div className="section-title">
        <div>
          <span className="eyebrow">REAL CAPITAL. YOUR CONVICTION.</span>
          <h1>My wallet takes.</h1>
        </div>
        <button className="dark" onClick={() => w.setOpen(true)}>
          <Wallet size={16} />
          {w.address ? "Add USDC" : "Connect wallet"}
        </button>
      </div>
      {w.address ? (
        <>
          <div className="wallet-portfolio-card">
            <BalanceSummary />
            <div>
              <span className="connected-label">
                <i className="live-dot" /> {shortAddress(w.address)}
              </span>
              <p>USDC ready to put behind your next take.</p>
              <button className="text-button" onClick={() => w.setOpen(true)}>
                Manage funds <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
          <h2 className="subheading">Your token baskets</h2>
          {holdings.length ? (
            <div className="holdings position-holdings">
              {holdings.map(({ t, assets }) => {
                const row = performance.rows.find((r) => r.thesisId === t.id);
                return (
                  <button
                    className="holding"
                    key={t.id}
                    onClick={() => onOpen(t.id)}
                  >
                    <div className="wallet-token-stack">
                      {assets.slice(0, 4).map((h) => (
                        <TokenIcon
                          key={`${h.asset.chainId}:${h.asset.symbol}`}
                          symbol={h.asset.symbol}
                        />
                      ))}
                    </div>
                    <div className="position-identity">
                      <h3>{t.title}</h3>
                      <span>
                        {assets
                          .map(
                            (h) =>
                              `${quantity(h.amount, h.asset.decimals)} ${h.asset.symbol}`,
                          )
                          .join(" · ")}
                      </span>
                    </div>
                    <PositionPnl
                      value={row?.value ?? null}
                      cost={row?.cost ?? 0}
                      loading={refreshing}
                    />
                    <ChevronRight size={18} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <h3>A belief. A basket. Yours.</h3>
              <p>Your confirmed wallet purchases will appear here.</p>
            </div>
          )}
          <p className="small-muted">
            Baskets track trades made in this browser; external transfers are
            not reflected in these quantities. Balances are rechecked before
            selling. Estimated unrealized P&L compares the open tokens with
            their remaining cost, before gas and exit fees. Prices refresh every
            minute; missing prices or receipts show as unavailable. Automated
            exits are not connected.
          </p>
          <OrderActivity orders={w.orders} />
        </>
      ) : (
        <div className="empty-state">
          <Wallet size={32} />
          <h3>Give your ideas some capital.</h3>
          <p>Connect your wallet, add USDC, and back a supported take.</p>
          <button className="dark" onClick={() => w.setOpen(true)}>
            Connect wallet
          </button>
        </div>
      )}
    </section>
  );
}
