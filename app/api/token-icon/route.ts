import { env } from "cloudflare:workers";
import { fetchTokenIcon } from "@/lib/token-icon-fetch";
type Icon = Awaited<ReturnType<typeof fetchTokenIcon>>;
const cache = new Map<string, { icon: Icon; expires: number }>();
const pending = new Map<string, Promise<Icon>>();
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[a-z0-9][a-z0-9-]{0,100}$/.test(id)) return new Response(null, { status: 400 });
  try {
    let entry = cache.get(id);
    if (!entry || entry.expires < Date.now()) {
      let task = pending.get(id);
      if (!task) { task = fetchTokenIcon(id, env.COINGECKO_API_KEY).catch(() => null); pending.set(id, task); }
      const icon = await task; pending.delete(id);
      entry = { icon, expires: Date.now() + (icon ? 86400000 : 300000) };
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(id, entry);
    }
    if (!entry.icon) return new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
    return new Response(entry.icon.body, { headers: { "Content-Type": entry.icon.contentType, "Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff" } });
  } catch { return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } }); }
}
