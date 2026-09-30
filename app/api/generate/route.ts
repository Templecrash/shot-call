import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
import { curatedTake } from "@/lib/data";
import {
  DEFAULT_MODEL,
  GenerationError,
  researchTake,
} from "@/lib/ai/provider";
import { fetchCoin, resolveResearch } from "@/lib/ai/resolve";
import {COUNTER_MODEL} from '@/lib/counter-generation';
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const requestSchema = z.object({
  id: z.string().uuid().optional(),
  take: z.string().trim().min(8).max(1500),
  mode: z.enum(["ai", "curated"]).default("ai"),
});
type Generation = {
  id: string;
  owner: string;
  prompt: string;
  status: string;
  result: string | null;
  error: string | null;
  created_at: number;
  updated_at: number;
};
function result(row: Generation) {
  if (row.result)
    return json({
      ...JSON.parse(row.result),
      generationId: row.id,
      status: row.status,
      mode: "ai",
    });
  if (row.status === "failed")
    return json(
      {
        error: row.error || "This research did not complete.",
        generationId: row.id,
        status: "failed",
      },
      422,
    );
  if (Date.now() - row.created_at > 300000)
    return json(
      {
        error:
          "This research expired before completing. Please start a new request.",
        generationId: row.id,
        status: "failed",
      },
      422,
    );
  return json({ generationId: row.id, status: "researching" }, 202);
}
export async function GET(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id");
    if (!id)
      return json({
        ready: !!env.OPENAI_API_KEY,
        mode: "ai",
        requiresSignIn: true,
      });
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Sign in to recover your AI draft.", code: "sign_in_required" }, 401);
    if (!z.string().uuid().safeParse(id).success)
      return json({ error: "Invalid draft link." }, 400);
    const row = await database()
      .prepare("SELECT * FROM generations WHERE id=? AND owner=? AND model<>?")
      .bind(id, user.userId,COUNTER_MODEL)
      .first<Generation>();
    return row
      ? result(row)
      : json({ error: "This draft is unavailable." }, 404);
  } catch {
    return json({ error: "Research drafts are unavailable right now." }, 503);
  }
}
export async function POST(req: Request) {
  let generationId: string | undefined,
    owner: string | undefined,
    started = false;
  try {
    if (
      req.headers.get("origin") &&
      new URL(req.headers.get("origin")!).origin !== new URL(req.url).origin
    )
      return json({ error: "Invalid origin." }, 403);
    const body = requestSchema.parse(await req.json());
    // Demo baskets remain an explicitly selected fallback, never an AI result.
    if (body.mode === "curated") {
      const thesis = curatedTake(body.take);
      return thesis
        ? json({ thesis, mode: "curated" })
        : json(
            {
              error:
                "No curated example matches this take. Try AI research or build a custom basket.",
            },
            422,
          );
    }
    const user = await getChatGPTUser();
    if (!user)
      return json(
        {
          error: "Sign in to research a take with AI.",
          code: "sign_in_required",
        },
        401,
      );
    owner = user.userId;
    if (!env.OPENAI_API_KEY)
      return json(
        {
          error:
            "Take generation is temporarily unavailable. Please try again later.",
          code: "ai_not_configured",
        },
        503,
      );
    const db = database();
    generationId = body.id || crypto.randomUUID();
    const existing = await db
      .prepare("SELECT * FROM generations WHERE id=?")
      .bind(generationId)
      .first<Generation>();
    if (existing) {
      if((existing as Generation&{model?:string}).model===COUNTER_MODEL)return json({error:'This request belongs to a counter call.'},409);
      if (existing.owner !== owner)
        return json({ error: "This draft is unavailable." }, 404);
      if (existing.prompt !== body.take)
        return json(
          { error: "This request ID belongs to a different take." },
          409,
        );
      return result(existing);
    }
    const now = Date.now(),
      model = env.OPENAI_MODEL || DEFAULT_MODEL;
    const inserted = await db
      .prepare(
        "INSERT OR IGNORE INTO generations (id,owner,prompt,model,status,created_at,updated_at) SELECT ?,?,?,?,'researching',?,? WHERE NOT EXISTS(SELECT 1 FROM generations WHERE owner=? AND status='researching' AND created_at>? AND model<>?) AND (SELECT COUNT(*) FROM generations WHERE owner=? AND created_at>? AND model<>?)<30",
      )
      .bind(
        generationId,
        owner,
        body.take,
        model,
        now,
        now,
        owner,
        now - 300000,
        COUNTER_MODEL,
        owner,
        now - 86400000,
        COUNTER_MODEL,
      )
      .run();
    if (!inserted.meta.changes) {
      const duplicate = await db
        .prepare("SELECT * FROM generations WHERE id=? AND owner=?")
        .bind(generationId, owner)
        .first<Generation>();
      if (duplicate) return result(duplicate);
      return json(
        {
          error:
            "Another research request is running, or your 30 daily AI requests have been used. Finish the active request or try later.",
          code: "research_limit",
        },
        429,
      );
    }
    started = true;
    const provider = await researchTake(
      body.take,
      env.OPENAI_API_KEY,
      model,
      fetch,
      async (raw) => {
        const response = raw as { model?: string; usage?: unknown };
        await db
          .prepare(
            "UPDATE generations SET provider_payload=?,usage=?,model=?,updated_at=? WHERE id=? AND owner=?",
          )
          .bind(
            JSON.stringify(raw),
            JSON.stringify(response.usage || null),
            response.model || model,
            Date.now(),
            generationId!,
            owner!,
          )
          .run();
      },
    );
    const resolved = await resolveResearch(
      provider,
      body.take,
      generationId,
      (id) => fetchCoin(id, env.COINGECKO_API_KEY),
    );
    await db
      .prepare(
        "UPDATE generations SET status='complete',result=?,updated_at=? WHERE id=? AND owner=?",
      )
      .bind(JSON.stringify(resolved), Date.now(), generationId, owner)
      .run();
    return json({ ...resolved, generationId, status: "complete", mode: "ai" });
  } catch (error) {
    const known = error instanceof GenerationError;
    const message =
      error instanceof z.ZodError
        ? "Give your take a little more detail (8–1,500 characters)."
        : known
          ? error.message
          : "Research could not finish. Please try again.";
    if (started && generationId && owner)
      try {
        await database()
          .prepare(
            "UPDATE generations SET status='failed',error=?,updated_at=? WHERE id=? AND owner=?",
          )
          .bind(message, Date.now(), generationId, owner)
          .run();
      } catch {
        /* Keep the pending record for recovery; never repeat the paid request automatically. */
      }
    return json(
      {
        error: message,
        code: known ? error.code : "generation_failed",
        generationId: started ? generationId : undefined,
      },
      error instanceof z.ZodError ? 400 : known ? error.status : 500,
    );
  }
}
