"use client";

import { usePeople } from "@/components/people/people-provider";
import { ProductDisclosure } from "@/components/product-disclosure";
import {ProfileSettings} from './profile-settings';
import { PnlShareDialog } from '@/components/pnl/pnl-share-dialog';
import { InviteManager } from '@/components/invites/invite-manager';
import type { TradePnl } from '@/lib/trade-pnl';
import { Users, Share2 } from "lucide-react";
import { CreatorEarnings } from "@/components/profit-share";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  RefreshCw,
  Activity,
  ShieldCheck,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { fundingNetwork } from "@/lib/demo-wallet";
import { type Thesis } from "@/lib/data";
import { tokenFor } from "@/lib/token-catalog";
import { TokenIconImage } from "@/components/token-icon";
import {
  CreatorAvatar,
  TwitterLink,
  EditCreatorButton,
  ProfileBanner,
} from "@/components/creator";
import type { Creator } from "@/lib/creators";
import { thesisArtwork } from "@/lib/artwork";
import { usd } from "@/lib/wallet/networks";
import {
  periodPoints,
  type PaperOrder,
  type PaperProfile,
  type Performance,
  type Point,
} from "@/lib/performance";

const money = (value: number | null) => (value === null ? "—" : usd(value));
const signed = (value: number | null) =>
  value === null
    ? "—"
    : `${value >= 0.005 ? "+" : value <= -0.005 ? "−" : ""}${usd(Math.abs(value))}`;
const tone = (value: number | null) =>
  value === null || Math.abs(value) < 0.005
    ? ""
    : value > 0
      ? "positive"
      : "negative";
type ProfileProps = {
  user: { id: string; name: string; creator?: Creator | null } | null;
  onEditCreator: () => void;
  onPeople: () => void;
  onMyTakes: () => void;
  onPublicProfile: (id: string) => void;
  loaded: boolean;
  error: string;
  theses: Thesis[];
  revision: number;
  onOpen: (id: string) => void;
  onDiscover: () => void;
  defaultBuyAmount: number;
  onBuyAmountSaved: (amount: number) => Promise<void>;
};

export function ProfileView(props: ProfileProps) {
  const people = usePeople();
  const calls = props.theses.filter(t=>t.owner===props.user?.id&&!t.archivedAt&&!t.example);
  return (
    <section className="profile-page">
      {props.user && <ProfileBanner url={props.user.creator?.bannerUrl} onEdit={props.onEditCreator}/>}
      <div className={`profile-heading${props.user ? ' profile-with-banner' : ''}`}>
        <div className="profile-identity">
          <CreatorAvatar
            creator={
              props.user?.creator || {
                id: props.user?.id || "",
                name: props.user?.name || "You",
                handle: null,
                twitterUrl: null,
                avatarUrl: null,
                bio: "",
              }
            }
            large
          />
          <div>

            <h1>
              {props.user?.creator?.name ||
                props.user?.name ||
                "Profile"}
            </h1>
            <p>
              {props.user?.creator?.bio ||
                ""}
            </p>
            {props.user?.creator && (
              <TwitterLink creator={props.user.creator} />
            )}
          </div>
        </div>
        <div className="profile-heading-actions">
          {props.user?.creator && <button className="outline" onClick={()=>props.onPublicProfile(props.user!.creator!.id)}>View public profile</button>}
          <button
            className="outline profile-people-link"
            onClick={props.onPeople}
          >
            <Users size={14} />
            {people.loading || people.error
              ? "Contacts"
              : `${people.followingIds.length} following`}
          </button>
          {props.user && (
            <EditCreatorButton
              onClick={props.onEditCreator}
              hasProfile={!!props.user.creator}
            />
          )}

        </div>
      </div>
      {props.user && <ProductDisclosure title="My calls" meta={String(calls.length)} defaultOpen>
        {calls.length ? <div className="profile-calls-list">{calls.map(call=><button key={call.id} onClick={()=>props.onOpen(call.id)}>
          <img src={thesisArtwork(call)} alt=""/><span><b>{call.title}</b><small>{call.visibility==='private'?'Private':call.closedAt?'Closed':'Published'} · {call.category}</small></span><ChevronRight size={17}/>
        </button>)}</div> : <p className="profile-no-calls">Your calls will appear here when you create one.</p>}
        <button className="text-button profile-manage-calls" onClick={props.onMyTakes}>Manage my calls</button>
      </ProductDisclosure>}
      {props.user&&<ProductDisclosure title="Settings" meta="Trading preferences" defaultOpen><ProfileSettings key={`${props.user.id}:${props.defaultBuyAmount}`} amount={props.defaultBuyAmount} onSaved={props.onBuyAmountSaved}/></ProductDisclosure>}
      {props.user&&<InviteManager key={props.user.id}/>}
      <PaperProfileView key={`${props.user?.id}:${props.revision}`} {...props}/>

    </section>
  );
}

function PaperProfileView({
  user,
  loaded,
  error: stateError,
  theses,
  onOpen,
  onDiscover,
}: ProfileProps) {
  const [shareTarget,setShareTarget] = useState<{kind:'trade'|'portfolio';orderId?:string}|null>(null);
  const [data, setData] = useState<PaperProfile | null>(null),
    [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/profile", { signal });
      const result = (await response.json()) as PaperProfile & {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Could not load performance.");
      setData(result);
      setError("");
    } catch (e) {
      if (!signal?.aborted)
        setError(
          e instanceof Error ? e.message : "Could not load performance.",
        );
    } finally {
      if (!signal?.aborted) setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    void Promise.resolve().then(() => {
      if (!controller.signal.aborted) return load(controller.signal);
    });
    const focus = () => void load(controller.signal);
    window.addEventListener("focus", focus);
    return () => {
      controller.abort();
      window.removeEventListener("focus", focus);
    };
  }, [user, load]);
  if (!loaded)
    return (
      <div className="profile-empty" role="status">
        Loading your profile…
      </div>
    );
  if (!user)
    return (
      <div className="profile-empty">
        <Activity size={28} />
        <h2>Profile</h2>
        <p>
          {stateError ||
            "Sign in to see your demo investments, performance, and activity in one place."}
        </p>
        <a
          className="dark"
          href="/signin-with-chatgpt?return_to=/%3Fview%3Dprofile"
          target="_top"
        >
          Sign in to view profile
        </a>
      </div>
    );
  if (!data)
    return (
      <div className="profile-empty" role="status">
        <p>{error || "Bringing your investments together…"}</p>
        {error && (
          <button className="outline" onClick={() => void load()}>
            Try again
          </button>
        )}
      </div>
    );
  return (
    <>
      {error && (
        <p className="form-error" role="alert">
          {error} Showing your last loaded snapshot.
        </p>
      )}
      <PerformanceOverview
        onShare={()=>setShareTarget({kind:'portfolio'})}
        performance={data.performance}
        cash={money(data.cash)}
        headline={money(data.equity)}
        label="Total value"
        percentage={data.funded ? ((data.performance.profit ?? 0) / data.funded) * 100 : 0}
        basis={`return on ${money(data.funded)} in demo funding`}
        paper
        now={data.checkedAt}
        theses={theses}
        onOpen={onOpen}
        onDiscover={onDiscover}
        refresh={() => {
          setRefreshing(true);
          void load();
        }}
        refreshing={refreshing}
      />

      {(theses.some(t=>t.owner===user.id&&t.visibility==='public')||data.orders.some(o=>o.side==='creator-income'))&&<ProductDisclosure title="Creator earnings" meta="Performance fees">      <CreatorEarnings
        theses={theses}
        onOpen={onOpen}
        revision={data.checkedAt}
      />
</ProductDisclosure>}
      <PaperActivity orders={data.orders} pnl={data.tradePnl} onShare={orderId=>setShareTarget({kind:'trade',orderId})} theses={theses} onOpen={onOpen} />
      {shareTarget&&<PnlShareDialog {...shareTarget} onClose={()=>setShareTarget(null)}/>}
      <details className="profile-methodology"><summary>How these numbers work</summary><p>Demo returns come from saved trades and simulated market moves, net of fees. Deposits and creator earnings do not count as investment returns. Archived prediction cash flows are excluded from investment returns. Unsettled stakes were refunded. Buys show P&L across sold and remaining exposure. Sells show realized P&L using average position cost, after recorded fees and profit shares.</p></details>
    </>
  );
}


function FilterBar({
  values,
  selected,
  onChange,
}: {
  values: string[];
  selected: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="activity-filter">Show <select aria-label="Filter activity" value={selected} onChange={e=>onChange(e.target.value)}>{values.map(value=><option key={value} value={value}>{value}</option>)}</select></label>
  );
}

function PerformanceOverview({
  onShare,
  performance: p,
  cash,
  headline,
  label,
  percentage,
  basis,
  paper,
  now,
  theses,
  onOpen,
  onDiscover,
  refresh,
  refreshing,
}: {
  onShare: () => void;
  performance: Performance;
  cash: string;
  headline: string;
  label: string;
  percentage: number | null;
  basis: string;
  paper: boolean;
  now: number;
  theses: Thesis[];
  onOpen: (id: string) => void;
  onDiscover: () => void;
  refresh: () => void;
  refreshing: boolean;
}) {
  const [range, setRange] = useState("ALL");
  const points = periodPoints(
    p.points,
    (
      { "1W": 7, "1M": 30, "3M": 90, ALL: null } as Record<
        string,
        number | null
      >
    )[range],
    now,
  );
  const periodChange = points.length
    ? points[points.length - 1].value - points[0].value
    : null;
  const open = p.rows.filter((r) => r.open),
    ranked = [...p.rows].sort(
      (a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity),
    );
  return (
    <>
      <div className="profile-total">
        <div>
          <span className="eyebrow">{label}</span>
          <strong>{headline}</strong>
          <div className={`profile-total-return ${tone(p.profit)}`}>
            <span>
              {signed(p.profit)}
              {percentage !== null
                ? ` (${percentage > 0 ? "+" : ""}${percentage.toFixed(2)}%)`
                : ""}
            </span>
            <small>all time</small>
          </div>
          <p>{basis}</p>
        </div>
        <div className="profile-performance-actions">
        <button className="outline" disabled={!p.trades} aria-label="Share portfolio P&L" onClick={onShare}><Share2 size={14}/> Share P&L</button>
        <button
          className="outline"
          disabled={refreshing}
          onClick={refresh}
          aria-label="Refresh performance"
        >
          <RefreshCw size={14} className={refreshing ? "spin" : ""} />
          <span>{refreshing ? "Refreshing…" : "Refresh"}</span>
        </button></div>
      </div>
      <div className="profile-metrics">
        <Metric
          label={paper ? "Invested" : "Open cost basis"}
          value={money(paper ? p.value : p.cost)}
          detail={`${open.length} active ${open.length === 1 ? "thesis" : "theses"}`}
        />
        <Metric
          label={paper ? "Available USD" : "Available USDC"}
          value={cash}
          detail={
            paper
              ? "Ready to invest"
              : "Across 6 networks · separate from returns"
          }
        />
        <Metric
          label="Realized P&L"
          value={signed(p.realized)}
          detail="From completed sales"
          color={tone(p.realized)}
        />
        <Metric
          label="Unrealized P&L"
          value={signed(p.unrealized)}
          detail={
            paper
              ? "On your open demo positions"
              : "Estimated on tracked holdings"
          }
          color={tone(p.unrealized)}
        />
      </div>
      <div className="profile-performance-grid">
        <section className="profile-chart-card">
          <div className="profile-chart-heading">
            <div>
              <span className="eyebrow">
                {paper ? "PORTFOLIO VALUE" : "REALIZED RETURN"}
              </span>
              <h2>Performance</h2>
            </div>
            <div
              className="profile-ranges"
              role="group"
              aria-label="Performance period"
            >
              {["1W", "1M", "3M", "ALL"].map((r) => (
                <button
                  key={r}
                  aria-pressed={range === r}
                  onClick={() => setRange(r)}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className={`profile-period-result ${tone(periodChange)}`}>
            {signed(periodChange)}{" "}
            <small>
              {range === "ALL"
                ? "since your first trade"
                : `over ${range === "1W" ? "the last week" : range === "1M" ? "the last month" : "the last 3 months"}`}
            </small>
          </div>
          <PerformanceChart
            points={points}
            paper={paper}
            empty={p.trades === 0}
          />
          <div className="profile-chart-caption">
            <span>
              <i />
              {paper
                ? "Demo investment value · excludes deposits and creator income"
                : "Confirmed sale proceeds − cost basis"}
            </span>
            <span>
              {p.trades
                ? `${p.trades} ${p.trades === 1 ? "trade" : "trades"}`
                : "No trades yet"}
            </span>
          </div>
        </section>
        <aside className="profile-perspective">

          <div>
            <span>Total purchased</span>
            <strong>{money(p.purchased)}</strong>
            <small>
              {paper
                ? "Cumulative demo buys"
                : "Confirmed USDC spent · excludes reserves"}
            </small>
          </div>
          <div>
            <span>Highest total return</span>
            {ranked[0]?.profit != null ? (
              <>
                <button onClick={() => onOpen(ranked[0].thesisId)}>
                  {theses.find((t) => t.id === ranked[0].thesisId)?.title ||
                    ranked[0].title ||
                    "Thesis"}{" "}
                  <ArrowUpRight size={15} />
                </button>
                <strong className={tone(ranked[0].profit)}>
                  {signed(ranked[0].profit)}
                </strong>
              </>
            ) : (
              <p>No returns recorded yet.</p>
            )}
          </div>
          <p className="profile-asof">
            <ShieldCheck size={13} />
            {paper ? "Saved portfolio" : "Prices requested"} ·{" "}
            {new Date(now).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </aside>
      </div>
      <section className="profile-investments">
        <div className="profile-section-title">
          <div>
            <h2>Investments</h2>
          </div>
          <button className="text-button" onClick={onDiscover}>
            Explore takes <ArrowUpRight size={15} />
          </button>
        </div>
        {p.rows.length ? (
          <div className="profile-table-scroll">
            <table className="profile-table">
              <thead>
                <tr>
                  <th>Thesis</th>
                  <th>Value</th>
                  <th>Open cost</th>
                  <th>Total return</th>
                  <th>
                    <span className="sr-only">Open thesis</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...p.rows]
                  .sort(
                    (a, b) =>
                      Number(b.open) - Number(a.open) ||
                      (b.value ?? 0) - (a.value ?? 0),
                  )
                  .map((row) => {
                    const thesis = theses.find((t) => t.id === row.thesisId),
                      symbols = paper
                        ? thesis?.allocations.map((a) => a.symbol) || []
                        : row.symbols;
                    return (
                      <tr key={row.thesisId}>
                        <td>
                          <button
                            className="profile-thesis"
                            onClick={() => onOpen(row.thesisId)}
                          >
                            {thesis ? (
                              <img
                                className="profile-thesis-art"
                                src={thesisArtwork(thesis)}
                                alt=""
                              />
                            ) : (
                              <span className="profile-thesis-art placeholder">
                                ✳
                              </span>
                            )}
                            <span>
                              <b>
                                {thesis?.title || row.title || "Saved thesis"}
                              </b>
                              <small>
                                <span className="profile-coin-stack">
                                  {symbols.slice(0, 4).map((symbol) => (
                                    <TokenIconImage key={symbol} token={tokenFor(thesis,symbol)} symbol={symbol} alt={tokenFor(thesis,symbol).symbol}/>
                                  ))}
                                </span>
                                {row.open ? "Active" : "Closed"}
                                {thesis && ` · ${thesis.category}`}
                              </small>
                            </span>
                          </button>
                        </td>
                        <td>{money(row.value)}</td>
                        <td>{money(row.cost)}</td>
                        <td className={tone(row.profit)}>
                          {signed(row.profit)}
                          <small>
                            {row.purchased && row.profit !== null
                              ? `${((row.profit / row.purchased) * 100).toFixed(2)}% on purchases`
                              : "Awaiting valuation"}
                          </small>
                        </td>
                        <td>
                          <button
                            onClick={() => onOpen(row.thesisId)}
                            aria-label={`Open ${thesis?.title || row.title || "thesis"}`}
                          >
                            <ChevronRight size={17} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="profile-empty compact">
            <h3>No investments yet</h3>
            <p>Invest in a take to start tracking performance.</p>
            <button className="dark" onClick={onDiscover}>
              Explore takes <ArrowUpRight size={14} />
            </button>
          </div>
        )}
      </section>
    </>
  );
}
function Metric({
  label,
  value,
  detail,
  color = "",
}: {
  label: string;
  value: string;
  detail: string;
  color?: string;
}) {
  return (
    <div>
      <span>{label}</span>
      <strong className={color}>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}
function PerformanceChart({
  points,
  paper,
  empty,
}: {
  points: Point[];
  paper: boolean;
  empty: boolean;
}) {
  if (!points.length || empty)
    return (
      <div className="profile-chart-empty">
        {empty
          ? "Your first trade starts your performance history."
          : "A complete confirmed history is needed to show this chart."}
      </div>
    );
  return (
    <div
      className="profile-chart"
      role="img"
      aria-label={
        paper
          ? "Demo investment value from recorded trades and market scenarios, excluding creator income"
          : "Cumulative realized return from confirmed sales, before gas"
      }
    >
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <AreaChart
          data={points}
          margin={{ top: 16, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="performance-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8fa786" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#8fa786" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke="#e8e9df"
            vertical={false}
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="time"
            type="number"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) =>
              points[points.length - 1].time - points[0].time < 86400000
                ? new Date(v).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : new Date(v).toLocaleDateString([], {
                    month: "short",
                    day: "numeric",
                  })
            }
            tick={{ fill: "#8a9183", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            minTickGap={65}
          />
          <YAxis
            width={58}
            domain={["auto", "auto"]}
            tickFormatter={(v) => usd(v).replace(".00", "")}
            tick={{ fill: "#8a9183", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            tickCount={4}
          />
          <Tooltip
            labelFormatter={(v) => new Date(Number(v)).toLocaleString()}
            formatter={(v) => [
              money(Number(v)),
              paper ? "Demo portfolio" : "Realized return",
            ]}
            contentStyle={{
              background: "#fafbf5",
              border: "1px solid #dce2d5",
              borderRadius: 10,
              fontSize: 12,
            }}
            cursor={{ stroke: "#afbaa6" }}
          />
          <Area
            type="stepAfter"
            dataKey="value"
            stroke="#58745d"
            strokeWidth={2}
            fill="url(#performance-fill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
function PaperActivity({
  orders,
  pnl,
  onShare,
  theses,
  onOpen,
}: {
  orders: PaperOrder[];
  pnl: Record<string,TradePnl>;
  onShare: (orderId:string) => void;
  theses: Thesis[];
  onOpen: (id: string) => void;
}) {
  const [filter, setFilter] = useState("All"),
    [limit, setLimit] = useState(10);
  const sides: Record<string, string> = {
    Buys: "buy",
    Sells: "sell",
    Scenarios: "scenario",
    Exits: "rule-exit",
    Earnings: "creator-income",
    Deposits: "demo-fund",
  };
  const filtered = orders.filter(
    (o) =>
      filter === "All" ||
      (filter === "Archived predictions"
        ? o.side.startsWith("prediction-")
        : o.side === sides[filter]),
  );
  return (
    <section className="profile-activity">
      <div className="profile-section-title">
        <div>
          <h2>Activity</h2>
        </div>
        <span className="muted">
          {orders.length} recorded {orders.length === 1 ? "event" : "events"}
        </span>
      </div>
      <FilterBar
        values={[
          "All",
          "Buys",
          "Sells",
          "Scenarios",
          "Exits",
          "Earnings",
          "Deposits",
          ...(orders.some(o=>o.side.startsWith("prediction-"))?["Archived predictions"]:[]),
        ]}
        selected={filter}
        onChange={(f) => {
          setFilter(f);
          setLimit(10);
        }}
      />
      {filtered.length ? (
        <div className="profile-activity-list">
          {filtered.slice(0, limit).map((order) => {
            const label =
              {
                buy: order.executionMode === "perps" ? `Bought ${order.leverage}× demo perps` : "Bought",
                sell: order.executionMode === "perps" ? "Closed demo perps" : "Sold",
                scenario: "Market scenario",
                "rule-exit": order.executionReason === "liquidation" ? "Demo liquidation" : "Exit rule triggered",
                "creator-income": "Creator earnings",
                "demo-fund": "Demo deposit",
                "prediction-stake": "Archived prediction stake",
                "prediction-payout": "Archived prediction payout",
                "prediction-refund": "Prediction refund",
              }[order.side] || order.side;
            const result=pnl?.[order.id];
            return (
              <article key={order.id}>
                <span className={`profile-event-icon ${order.side}`}>
                  {order.side === "buy" ? (
                    <ArrowDownLeft size={19} />
                  ) : order.side === "scenario" ? (
                    <Activity size={18} />
                  ) : order.side === "rule-exit" ? (
                    <ShieldCheck size={18} />
                  ) : (
                    <ArrowUpRight size={19} />
                  )}
                </span>
                <div className="profile-event-main">
                  <span>
                    {label} <i>· Demo</i>
                  </span>
                  {order.side === "demo-fund" ? <b>{fundingNetwork(order)}</b> : <button onClick={() => onOpen(order.thesisId)}>
                    {theses.find((t) => t.id === order.thesisId)?.title || "Saved thesis"}
                  </button>}
                  <time dateTime={new Date(order.createdAt).toISOString()}>
                    {new Date(order.createdAt).toLocaleString([], {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </time>
                </div>
                <div className="profile-event-amount">
                  <strong>
                    {usd(
                      (order.amount -
                        (order.creatorFee || 0) -
                        (order.tradingFee || 0) - (order.platformProfitFee || 0)) /
                        100,
                    )}
                  </strong>
                  {!!order.tradingFee && (
                    <small>
                      {usd(order.tradingFee / 100)} {(order.feePolicy==='v2'||order.feePolicy==='v3')?'entry':'trading'} fee deducted
                    </small>
                  )}
                  {!!order.platformProfitFee&&<small>{usd(order.platformProfitFee/100)} platform profit share deducted</small>}
                  {!!order.creatorFee && (
                    <small>
                      {usd(order.creatorFee / 100)} creator share deducted
                    </small>
                  )}
                  <small>
                    {order.side === "scenario"
                      ? "New position value"
                      : order.side === "prediction-stake"
                        ? "Historical stake"
                        : order.side === "buy"
                          ? "Allocated"
                          : order.side === "creator-income"
                            ? "Added to demo cash"
                            : "Returned to cash"}
                  </small>
                </div>
                {result && <div className={`profile-event-pnl ${tone(result.profit)}`}>
                  <span>{order.side==='buy'?'Buy P&L':'Realized P&L'}</span>
                  <strong>{signed(result.profit)}</strong>
                  <small>{result.percent===null?'Unavailable':`${result.percent>0?'+':''}${result.percent.toFixed(2)}% · ${result.status}`}</small>
                  <button className="text-button" disabled={result.profit===null||result.percent===null} aria-label={`Share P&L for ${theses.find(t=>t.id===order.thesisId)?.title||'trade'} ${order.id}`} onClick={()=>onShare(order.id)}><Share2 size={13}/> Share P&L</button>
                </div>}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="profile-empty compact">
          <Activity size={24} />
          <h3>
            {orders.length
              ? "No matching activity."
              : "Your next move starts here."}
          </h3>
          <p>
            Buys, sells, scenarios, and exit rules will appear in your timeline.
          </p>
        </div>
      )}
      {filtered.length > limit && (
        <button
          className="outline profile-more"
          onClick={() => setLimit(limit + 10)}
        >
          Show more activity
        </button>
      )}
    </section>
  );
}
