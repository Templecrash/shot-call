"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import {
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ThesisArtwork } from "@/components/thesis-artwork";
import { thesisArtwork } from "@/lib/artwork";
import {
  CHART_RANGES,
  chartChange,
  type ChartRange,
  type CoinChart,
} from "@/lib/coin-chart";
import type { Thesis } from "@/lib/data";

const cache = new Map<string, CoinChart>();
const priceLabel = (price: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    ...(price >= 1
      ? { maximumFractionDigits: 2 }
      : { maximumSignificantDigits: 5 }),
  }).format(price);
const sampledAt = (time: number) =>
  new Date(time).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
const axisTime = (time: number, range: ChartRange) =>
  new Date(time).toLocaleString(
    undefined,
    range === "1D"
      ? { hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric" },
  );

export function CoinPriceChart({
  thesis,
  symbol,
  name,
}: {
  thesis: Thesis;
  symbol: string;
  name: string;
}) {
  const [range, setRange] = useState<ChartRange>("1M");
  const [chart, setChart] = useState<CoinChart | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    const key = `${thesis.id}:${symbol}:${range}`;
    setChart(null);
    setError("");
    const saved = cache.get(key);
    if (saved && Date.now() - saved.fetchedAt < 300000) {
      setChart(saved);
      return () => abort.abort();
    }
    void (async () => {
      try {
        const query = new URLSearchParams({
          thesisId: thesis.id,
          symbol,
          range,
        });
        const response = await fetch(`/api/coin-chart?${query}`, {
          signal: abort.signal,
        });
        const body = (await response.json()) as CoinChart & { error?: string };
        if (!response.ok)
          throw new Error(
            body.error || "Price history is unavailable. Please try again.",
          );
        if (abort.signal.aborted) return;
        if (cache.size >= 120) cache.delete(cache.keys().next().value!);
        cache.set(key, body);
        setChart(body);
      } catch (e) {
        if (!abort.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "Price history is unavailable. Please try again.",
          );
      }
    })();
    return () => abort.abort();
  }, [thesis.id, symbol, range, retry]);

  const data = chart?.range === range ? chart : null;
  const last = data?.points.at(-1);
  const change = data ? chartChange(data.points) : null;
  const negative = change !== null && change < 0;
  const color = negative ? "#f7bbab" : "#bcf5d0";
  return (
    <section
      className="coin-price-panel"
      aria-label={`${name} USD price history`}
    >
      <ThesisArtwork src={thesisArtwork(thesis)} compact />
      <div className="coin-price-shade" />
      <div className="coin-price-content">
        <div className="coin-price-heading">
          <div>
            <span className="coin-price-eyebrow">MARKET PRICE · USD</span>
            <strong>{last ? priceLabel(last.price) : "—"}</strong>
          </div>
          {change !== null && (
            <div
              className={`coin-price-change ${negative ? "is-negative" : ""}`}
            >
              <span>
                {negative ? "↘" : "↗"} {change >= 0 ? "+" : ""}
                {change.toFixed(2)}%
              </span>
              <small>
                past {CHART_RANGES[range]} {range === "1D" ? "day" : "days"}
              </small>
            </div>
          )}
        </div>
        <div className="coin-price-plot" aria-busy={!data && !error}>
          {data && last ? (
            <>
              <p className="sr-only">
                {name} price moved from {priceLabel(data.points[0].price)} to{" "}
                {priceLabel(last.price)} over the available {range} history. Use
                the arrow keys on the chart to explore prices.
              </p>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <LineChart
                  data={data.points}
                  margin={{ top: 15, right: 9, bottom: 0, left: 9 }}
                  accessibilityLayer
                >
                  <XAxis
                    dataKey="time"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    ticks={[
                      data.points[0].time,
                      data.points[Math.floor(data.points.length / 2)].time,
                      last.time,
                    ]}
                    tickFormatter={(time) => axisTime(time, range)}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#e3dfeb", fontSize: 10 }}
                    tickMargin={12}
                    interval="preserveStartEnd"
                    minTickGap={32}
                  />
                  <YAxis
                    hide
                    domain={([min, max]: readonly [number, number]) => {
                      const pad = (max - min || max * 0.01) * 0.12;
                      return [min - pad, max + pad];
                    }}
                  />
                  <Tooltip
                    cursor={{ stroke: "#ffffff50", strokeDasharray: "3 5" }}
                    content={({ active, payload }) => {
                      const point = payload?.[0]?.payload;
                      return active && point ? (
                        <div className="coin-price-tooltip">
                          <b>{priceLabel(point.price)}</b>
                          <span>{sampledAt(point.time)}</span>
                        </div>
                      ) : null;
                    }}
                  />
                  <Line
                    dataKey="price"
                    name="USD price"
                    type="monotone"
                    stroke={color}
                    strokeWidth={2.6}
                    dot={false}
                    activeDot={{
                      r: 5,
                      fill: "#def58e",
                      stroke: "#fff",
                      strokeWidth: 1.5,
                    }}
                    isAnimationActive={false}
                  />
                  <ReferenceDot
                    x={last.time}
                    y={last.price}
                    r={4.5}
                    fill="#def58e"
                    stroke="#def58e"
                  />
                </LineChart>
              </ResponsiveContainer>
            </>
          ) : (
            <div className="coin-price-empty" role="status">
              {error ? (
                <>
                  <span>{error}</span>
                  <button type="button" onClick={() => setRetry((n) => n + 1)}>
                    <RefreshCw size={13} /> Try again
                  </button>
                </>
              ) : (
                <>
                  <Loader2 className="animate-spin" size={19} />
                  <span>Loading {name} price history…</span>
                </>
              )}
            </div>
          )}
        </div>
        <div className="coin-price-footer">
          <span>Coin price</span>
          <div
            className="coin-price-ranges"
            role="group"
            aria-label="Price chart period"
          >
            {(Object.keys(CHART_RANGES) as ChartRange[]).map((period) => (
              <button
                key={period}
                type="button"
                aria-pressed={range === period}
                onClick={() => {
                  if (period === range) return;
                  setChart(null);
                  setError("");
                  setRange(period);
                }}
              >
                {period}
              </button>
            ))}
          </div>
        </div>
        {data && last && (
          <div className="coin-price-source">
            <a href={data.source} target="_blank" rel="noreferrer">
              CoinGecko <ExternalLink size={10} />
            </a>
            <span>As of {sampledAt(last.time)} · cached up to 5 min</span>
          </div>
        )}
      </div>
    </section>
  );
}
