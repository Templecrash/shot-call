import { z } from "zod";
import { publicUrl } from "../ai/urls";
import type { Thesis } from "../data";
import type { EvidenceItem, EvidenceReport } from "./types";

export function canonicalEvidenceUrl(value: string) {
  if (!publicUrl(value)) return "";
  const u = new URL(value);
  u.hash = "";
  u.hostname = u.hostname
    .replace(/^www\./, "")
    .replace(/^twitter\.com$/, "x.com");
  const post =
    u.hostname === "x.com" &&
    u.pathname.match(/^\/[^/]+\/status\/(\d+)(?:\/|$)/);
  if (post) {
    u.pathname = `/i/status/${post[1]}`;
    u.search = "";
  }
  for (const key of [...u.searchParams.keys()])
    if (key.startsWith("utm_") || ["fbclid", "gclid"].includes(key))
      u.searchParams.delete(key);
  return u.toString().replace(/\/$/, "");
}
export function socialPermalink(value: string) {
  if (!publicUrl(value)) return false;
  const u = new URL(value),
    host = u.hostname.replace(/^www\./, "");
  return (
    ((host === "x.com" || host === "twitter.com") &&
      /^\/[^/]+\/status\/\d+/.test(u.pathname)) ||
    (host === "reddit.com" &&
      /^\/r\/[^/]+\/comments\/[^/]+/.test(u.pathname)) ||
    (host === "bsky.app" &&
      /^\/profile\/[^/]+\/post\/[^/]+/.test(u.pathname)) ||
    (["warpcast.com", "farcaster.xyz"].includes(host) &&
      /^\/[^/]+\/0x[a-f\d]+/i.test(u.pathname))
  );
}
export const evidenceItemSchema = z.object({
  title: z.string().min(3).max(180),
  url: z.string().max(1000).refine(publicUrl),
  publisher: z.string().min(1).max(90),
  author: z.string().max(90).nullable(),
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  kind: z.enum(["article", "social", "research", "docs"]),
  stance: z.enum(["supports", "challenges", "context"]),
  relationship: z.enum(["project", "independent", "regulator", "community"]),
  summary: z.string().min(10).max(500),
  relevance: z.string().min(10).max(400),
});
export const evidenceSchema = z.object({
  items: z.array(evidenceItemSchema).max(12),
  coverageNote: z.string().min(10).max(700),
});
const str = (minLength: number, maxLength: number) => ({ type: "string", minLength, maxLength });
export const EVIDENCE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "coverageNote"],
  properties: {
    items: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "title",
          "url",
          "publisher",
          "author",
          "publishedAt",
          "kind",
          "stance",
          "relationship",
          "summary",
          "relevance",
        ],
        properties: {
          title: str(3, 180),
          url: { ...str(1, 1000), pattern: "^https://" },
          publisher: str(1, 90),
          author: { type: ["string", "null"], maxLength: 90 },
          publishedAt: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
          kind: {
            type: "string",
            enum: ["article", "social", "research", "docs"],
          },
          stance: {
            type: "string",
            enum: ["supports", "challenges", "context"],
          },
          relationship: {
            type: "string",
            enum: ["project", "independent", "regulator", "community"],
          },
          summary: str(10, 500),
          relevance: str(10, 400),
        },
      },
    },
    coverageNote: str(10, 700),
  },
};
export function verifiedEvidence(
  raw: unknown,
  observed: { url: string }[],
  now = Date.now(),
) {
  const parsed = evidenceSchema.parse(raw),
    sources = new Set(
      observed.map((s) => canonicalEvidenceUrl(s.url)).filter(Boolean),
    ),
    seen = new Set<string>();
  const items = parsed.items.filter((item) => {
    const url = canonicalEvidenceUrl(item.url);
    const socialHost = [
      "x.com",
      "twitter.com",
      "reddit.com",
      "bsky.app",
      "warpcast.com",
      "farcaster.xyz",
    ].includes(new URL(item.url).hostname.replace(/^www\./, ""));
    if (
      !url ||
      !sources.has(url) ||
      seen.has(url) ||
      ((item.kind === "social" || socialHost) && !socialPermalink(item.url))
    )
      return false;
    if (
      item.publishedAt &&
      (!Number.isFinite(Date.parse(item.publishedAt)) ||
        new Date(item.publishedAt).toISOString().slice(0, 10) !==
          item.publishedAt ||
        Date.parse(item.publishedAt) > now)
    )
      return false;
    seen.add(url);
    if (socialHost) item.kind = "social";
    return true;
  });
  const dropped = parsed.items.length - items.length;
  return {
    items,
    coverageNote:
      parsed.coverageNote +
      (dropped
        ? " Some proposed sources were omitted because their link, date or social-post identity could not be confirmed."
        : ""),
  };
}
export function evidenceSentiment(items: EvidenceItem[]) {
  const unique = [
    ...new Map(
      items
        .filter((i) => canonicalEvidenceUrl(i.url))
        .map((i) => [canonicalEvidenceUrl(i.url), i]),
    ).values(),
  ];
  const supports = unique.filter((i) => i.stance === "supports").length,
    challenges = unique.filter((i) => i.stance === "challenges").length,
    context = unique.length - supports - challenges;
  const directional = unique.filter((i) => i.stance !== "context");
  const publishers = new Set(
    directional.map((i) => {
      const u = new URL(i.url);
      u.hostname = u.hostname
        .replace(/^www\./, "")
        .replace(/^twitter\.com$/, "x.com");
      return socialPermalink(i.url)
        ? `${u.hostname}/${u.pathname.split("/")[["bsky.app", "reddit.com"].includes(u.hostname) ? 2 : 1].toLowerCase()}`
        : u.hostname.split(".").slice(-2).join(".");
    }),
  ).size;
  const enough = directional.length >= 3 && publishers >= 2;
  const score = enough
    ? Math.round((100 * supports) / directional.length)
    : null;
  return {
    supports,
    challenges,
    context,
    publishers,
    score,
    label:
      score === null
        ? "Not enough evidence"
        : score >= 60
          ? "Leans supportive"
          : score <= 40
            ? "Leans skeptical"
            : "Mixed views",
  };
}
export function evidenceSnapshot(t: Thesis) {
  return JSON.stringify({
    title: t.title,
    body: t.body,
    allocations: [...t.allocations].sort((a, b) =>
      a.symbol.localeCompare(b.symbol),
    ),
  });
}
export async function evidenceFingerprint(t: Thesis) {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(evidenceSnapshot(t)),
  );
  return [...new Uint8Array(hash)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
}
export function reportIsStale(
  report: EvidenceReport,
  fingerprint: string,
  now = Date.now(),
) {
  return (
    report.fingerprint !== fingerprint ||
    now - report.generatedAt > 7 * 86400000
  );
}

export function shouldResearchAutomatically(
  data: { ready: boolean; report: EvidenceReport | null; stale?: boolean },
  signedIn: boolean,
  now = Date.now(),
) {
  return signedIn && data.ready && (
    !data.report || data.stale || data.report.basis !== "ai" ||
    now - data.report.generatedAt >= 6 * 3600000
  );
}

// The TL;DR adds no new claims: each point is the report's thesis-specific
// reading, with its original source attached. Context never becomes a pro/con.
export function evidenceTakeaways(items: EvidenceItem[]) {
  const unique = [...new Map(items.filter(item => publicUrl(item.url))
    .map(item => [canonicalEvidenceUrl(item.url), item])).values()];
  return {
    pros: unique.filter(item => item.stance === "supports").slice(0, 2),
    cons: unique.filter(item => item.stance === "challenges").slice(0, 2),
  };
}
