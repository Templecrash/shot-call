import {readThesis} from "@/lib/thesis-store";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import { env } from "cloudflare:workers";
import { database } from "@/db/raw";
import {
  CHART_RANGES,
  chartCoinId,
  fetchCoinChart,
  CoinChartError,
  type ChartRange,
  type CoinChart,
} from "@/lib/coin-chart";

const cache = new Map<string, CoinChart>();
const pending = new Map<string, Promise<CoinChart>>();
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Cache-Control": status === 200 ? "private, max-age=60" : "no-store",
    },
  });

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const thesisId = params.get("thesisId"),
      key = params.get("symbol"),
      range = params.get("range") || "1M";
    if (
      !thesisId ||
      thesisId.length > 80 ||
      !key ||
      key.length > 140 ||
      !Object.hasOwn(CHART_RANGES, range)
    )
      return json({ error: "Choose a coin and a valid chart period." }, 400);
    const user=await getChatGPTUser();
    const thesis=await readThesis(database(),thesisId,user?.userId);
    if (!thesis) return json({ error: "This take is unavailable." }, 404);
    const coinId = chartCoinId(thesis, key);
    if (!coinId)
      return json(
        { error: "Verified price history is not available for this coin yet." },
        404,
      );
    const cacheKey = `${coinId}:${range}`;
    const saved = cache.get(cacheKey);
    if (saved && Date.now() - saved.fetchedAt < 300000) return json(saved);
    let request = pending.get(cacheKey);
    if (!request) {
      request = fetchCoinChart(
        coinId,
        range as ChartRange,
        env.COINGECKO_API_KEY,
      )
        .then((chart) => {
          if (cache.size >= 120) cache.delete(cache.keys().next().value!);
          cache.set(cacheKey, chart);
          return chart;
        })
        .finally(() => pending.delete(cacheKey));
      pending.set(cacheKey, request);
    }
    return json(await request);
  } catch (error) {
    return json(
      {
        error:
          error instanceof CoinChartError
            ? error.message
            : "Price history is temporarily unavailable. Please try again.",
      },
      error instanceof CoinChartError ? error.status : 503,
    );
  }
}
