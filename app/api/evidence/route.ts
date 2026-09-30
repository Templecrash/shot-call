import {readThesis} from "@/lib/thesis-store";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
import { type Thesis } from "@/lib/data";
import { DEFAULT_MODEL, GenerationError } from "@/lib/ai/provider";
import {
  evidenceFingerprint,
  evidenceSnapshot,
  reportIsStale,
} from "@/lib/evidence/core";
import { curatedEvidence } from "@/lib/evidence/curated";
import { researchEvidence } from "@/lib/evidence/provider";
import type { EvidenceReport } from "@/lib/evidence/types";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const input = z.object({
  id: z.string().uuid(),
  thesisId: z.string().min(1).max(80),
});
type Row = {
  id: string;
  owner: string;
  thesis_id: string;
  fingerprint: string;
  status: string;
  result: string | null;
  error: string | null;
  created_at: number;
};
function responseFor(row: Row, fingerprint: string) {
  if (row.result) {
    const report = JSON.parse(row.result) as EvidenceReport;
    return json({
      ready: !!env.OPENAI_API_KEY,
      report,
      stale: reportIsStale(report, fingerprint),
    });
  }
  if (row.status === "failed")
    return json(
      { error: row.error || "Research did not finish.", report: null },
      422,
    );
  if (Date.now() - row.created_at > 180000)
    return json(
      {
        error: "This research did not finish. Start a new search to try again.",
        report: null,
      },
      422,
    );
  return json(
    { pendingId: row.id, report: null, ready: !!env.OPENAI_API_KEY },
    202,
  );
}
async function latest(t: Thesis, fingerprint: string) {
  const row = await database()
    .prepare(
      "SELECT * FROM evidence_reports WHERE thesis_id=? AND status='complete' ORDER BY (fingerprint=?) DESC, created_at DESC LIMIT 1",
    )
    .bind(t.id, fingerprint)
    .first<Row>();
  const candidates: EvidenceReport[] = [];
  if (row?.result) candidates.push(JSON.parse(row.result));
  if (t.research?.evidence) candidates.push(t.research.evidence);
  const curated = await curatedEvidence(t);
  if (curated) candidates.push(curated);
  return (
    candidates.sort(
      (a, b) =>
        Number(b.fingerprint === fingerprint) -
          Number(a.fingerprint === fingerprint) ||
        b.generatedAt - a.generatedAt,
    )[0] || null
  );
}
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams,
      thesisId = params.get("thesisId"),
      id = params.get("id");
    if (!thesisId || thesisId.length > 80)
      return json({ error: "Choose a published take." }, 400);
    const user=await getChatGPTUser();
    const thesis = await readThesis(database(),thesisId,user?.userId);
    if (!thesis) return json({ error: "This take is unavailable." }, 404);
    const fingerprint = await evidenceFingerprint(thesis);
    if (id) {
      if (id.length > 120) return json({ error: "Invalid report link." }, 400);
      const row = await database()
        .prepare("SELECT * FROM evidence_reports WHERE id=? AND thesis_id=?")
        .bind(id, thesisId)
        .first<Row>();
      if (row) return responseFor(row, fingerprint);
      const saved = thesis.research?.evidence,
        curated = await curatedEvidence(thesis);
      const report =
        saved?.id === id ? saved : curated?.id === id ? curated : null;
      return report
        ? json({
            ready: !!env.OPENAI_API_KEY,
            report,
            stale: reportIsStale(report, fingerprint),
          })
        : json({ error: "This report is unavailable." }, 404);
    }
    const report = await latest(thesis, fingerprint);
    return json({
      ready: !!env.OPENAI_API_KEY,
      report,
      stale: report ? reportIsStale(report, fingerprint) : false,
    });
  } catch {
    return json(
      { error: "Sources are temporarily unavailable. Please retry." },
      503,
    );
  }
}
export async function POST(req: Request) {
  let started = false,
    id: string | undefined,
    owner: string | undefined;
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).origin !== new URL(req.url).origin)
      return json({ error: "Invalid origin." }, 403);
    const body = input.parse(await req.json());
    const user = await getChatGPTUser();
    if (!user)
      return json(
        { error: "Sign in to research both sides.", code: "sign_in_required" },
        401,
      );
    owner = user.userId;
    id = body.id;
    const thesis = await readThesis(database(),body.thesisId,user.userId);
    if (!thesis)
      return json({ error: "Publish this take before researching it." }, 404);
    const fingerprint = await evidenceFingerprint(thesis),
      db = database();
    const existing = await db
      .prepare("SELECT * FROM evidence_reports WHERE id=?")
      .bind(id)
      .first<Row>();
    if (existing) {
      if (existing.owner !== owner)
        return json({ error: "This research request is unavailable." }, 404);
      if (
        existing.thesis_id !== thesis.id ||
        existing.fingerprint !== fingerprint
      )
        return json(
          { error: "This request belongs to a different version of the take." },
          409,
        );
      return responseFor(existing, fingerprint);
    }
    if (!env.OPENAI_API_KEY)
      return json(
        {
          error:
            "Live research is temporarily unavailable. Please try again later.",
          code: "ai_not_configured",
        },
        503,
      );
    const now = Date.now(),
      previous = await latest(thesis, fingerprint);
    if (
      previous?.basis === "ai" &&
      previous.fingerprint === fingerprint &&
      now - previous.generatedAt < 6 * 3600000
    )
      return json({
        report: previous,
        ready: true,
        stale: false,
        cached: true,
      });
    const model = env.OPENAI_MODEL || DEFAULT_MODEL;
    const inserted = await db
      .prepare(
        "INSERT OR IGNORE INTO evidence_reports (id,owner,thesis_id,fingerprint,prompt,model,status,created_at,updated_at) SELECT ?,?,?,?,?,?,'researching',?,? WHERE NOT EXISTS(SELECT 1 FROM evidence_reports WHERE status='researching' AND created_at>? AND (owner=? OR (thesis_id=? AND fingerprint=?))) AND (SELECT COUNT(*) FROM evidence_reports WHERE owner=? AND created_at>?)<10",
      )
      .bind(
        id,
        owner,
        thesis.id,
        fingerprint,
        evidenceSnapshot(thesis),
        model,
        now,
        now,
        now - 180000,
        owner,
        thesis.id,
        fingerprint,
        owner,
        now - 86400000,
      )
      .run();
    if (!inserted.meta.changes) {
      const duplicate = await db
        .prepare(
          "SELECT * FROM evidence_reports WHERE (id=? OR (thesis_id=? AND fingerprint=? AND status='researching' AND created_at>?)) ORDER BY created_at DESC LIMIT 1",
        )
        .bind(id, thesis.id, fingerprint, now - 180000)
        .first<Row>();
      if (duplicate) return responseFor(duplicate, fingerprint);
      return json(
        {
          error:
            "Finish your active research first, or try later if you have used your 10 daily searches.",
        },
        429,
      );
    }
    started = true;
    const provider = await researchEvidence(
      thesis,
      env.OPENAI_API_KEY,
      model,
      fetch,
      async (raw) => {
        const response = raw as { model?: string; usage?: unknown };
        await db
          .prepare(
            "UPDATE evidence_reports SET provider_payload=?,usage=?,model=?,updated_at=? WHERE id=? AND owner=?",
          )
          .bind(
            JSON.stringify(raw),
            JSON.stringify(response.usage || null),
            response.model || model,
            Date.now(),
            id!,
            owner!,
          )
          .run();
      },
    );
    const report: EvidenceReport = {
      id,
      thesisId: thesis.id,
      fingerprint,
      take: thesis.body,
      generatedAt: Date.now(),
      basis: "ai",
      model: provider.model,
      ...provider.report,
    };
    await db
      .prepare(
        "UPDATE evidence_reports SET status='complete',result=?,updated_at=? WHERE id=? AND owner=?",
      )
      .bind(JSON.stringify(report), Date.now(), id, owner)
      .run();
    const current = await readThesis(db, thesis.id, owner);
    return json({
      report,
      ready: true,
      stale:
        !current || reportIsStale(report, await evidenceFingerprint(current)),
    });
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? "Choose a valid take to research."
        : error instanceof GenerationError
          ? error.message
          : "Research could not finish. Your saved sources are unchanged.";
    if (started && id && owner)
      try {
        await database()
          .prepare(
            "UPDATE evidence_reports SET status='failed',error=?,updated_at=? WHERE id=? AND owner=?",
          )
          .bind(message, Date.now(), id, owner)
          .run();
      } catch {}
    return json(
      { error: message },
      error instanceof z.ZodError
        ? 400
        : error instanceof GenerationError
          ? error.status
          : 503,
    );
  }
}
