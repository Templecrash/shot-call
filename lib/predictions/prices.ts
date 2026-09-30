import { normalizePrices } from "../coin-chart";
import { HOUR, PredictionError, type BasketToken } from "./model";

export type BoundaryPrices = Record<
  string,
  { start: number; end: number; startTime: number; endTime: number }
>;
export async function fetchBoundaryPrices(
  basket: BasketToken[],
  startsAt: number,
  endsAt: number,
  apiKey?: string,
  fetcher: typeof fetch = fetch,
  resume: BoundaryPrices = {},
  onProgress?: (prices: BoundaryPrices) => Promise<void>,
): Promise<BoundaryPrices> {
  async function history(id: string, from: number, to: number) {
    const params = new URLSearchParams({
      vs_currency: "usd",
      from: String(Math.floor(from / 1000)),
      to: String(Math.floor(to / 1000)),
    });
    const res = await fetcher(
      `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart/range?${params}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "ShotCall/1.0 (paper prediction settlement)",
          ...(apiKey ? { "x-cg-demo-api-key": apiKey } : {}),
        },
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!res.ok) {
      console.warn("Prediction boundary price unavailable", {
        coinId: id,
        from,
        to,
        status: res.status,
      });
      throw new PredictionError(
        "Historical pricing is temporarily unavailable. Your stake stays locked until verified prices arrive, or is refunded after 7 days.",
        503,
      );
    }
    const raw = (await res.json()) as { prices?: unknown };
    return normalizePrices(raw.prices);
  }
  function select(points: ReturnType<typeof normalizePrices>, at: number) {
    const point = points
      .filter((p) => p.time <= at && p.time >= at - 65 * 60_000)
      .at(-1);
    if (!point)
      throw new PredictionError(
        "A complete price snapshot is missing. Settlement is pending; the pool refunds after 7 days if prices remain unavailable.",
        503,
      );
    return point;
  }
  const prices: BoundaryPrices = {};
  // Reuse persisted verified tokens after throttling instead of restarting the whole basket.
  for (const token of basket) {
    const saved = resume[token.coinId];
    if (
      saved &&
      saved.start > 0 &&
      saved.end > 0 &&
      Number.isFinite(saved.start) &&
      Number.isFinite(saved.end) &&
      saved.startTime <= startsAt &&
      saved.startTime >= startsAt - 65 * 60_000 &&
      saved.endTime <= endsAt &&
      saved.endTime >= endsAt - 65 * 60_000
    ) {
      prices[token.coinId] = saved;
      continue;
    }
    const [startPoints, endPoints] =
      endsAt - startsAt <= 24 * HOUR
        ? await history(token.coinId, startsAt - 2 * HOUR, endsAt + HOUR).then(
            (points) => [points, points],
          )
        : await Promise.all([
            history(token.coinId, startsAt - 48 * HOUR, startsAt + HOUR),
            history(token.coinId, endsAt - 48 * HOUR, endsAt + HOUR),
          ]);
    const start = select(startPoints, startsAt),
      end = select(endPoints, endsAt);
    prices[token.coinId] = {
      start: start.price,
      end: end.price,
      startTime: start.time,
      endTime: end.time,
    };
    await onProgress?.({ [token.coinId]: prices[token.coinId] });
  }
  return prices;
}
