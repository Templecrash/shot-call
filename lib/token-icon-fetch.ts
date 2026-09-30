import { safeRemoteIcon } from "./token-icons";
const LIMIT = 1024 * 1024;
export async function fetchTokenIcon(id: string, apiKey?: string, fetcher: typeof fetch = fetch) {
  if (!/^[a-z0-9][a-z0-9-]{0,100}$/.test(id)) return null;
  const metadata = await fetcher(`https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}?localization=false&tickers=false&market_data=false&community_data=false&developer_data=false`, {
    headers: { Accept: "application/json", ...(apiKey ? { "x-cg-demo-api-key": apiKey } : {}) },
    signal: AbortSignal.timeout(10000), redirect: "error",
  });
  if (!metadata.ok) return null;
  const coin = await metadata.json() as { id?: string; image?: { small?: string; large?: string } };
  if (coin.id !== id) return null;
  const url = safeRemoteIcon(coin.image?.small || coin.image?.large);
  if (!url) return null;
  const response = await fetcher(url, { signal: AbortSignal.timeout(10000), redirect: "error" });
  const type = response.headers.get("content-type")?.split(";")[0];
  if (!response.ok || !type || !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type)) return null;
  if (Number(response.headers.get("content-length")) > LIMIT) return null;
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > LIMIT) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  if (!size) return null;
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { body: bytes.buffer, contentType: type };
}
