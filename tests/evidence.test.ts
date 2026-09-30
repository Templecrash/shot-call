import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalEvidenceUrl,
  evidenceFingerprint,
  evidenceSentiment,
  evidenceTakeaways,
  shouldResearchAutomatically,
  reportIsStale,
  socialPermalink,
  verifiedEvidence,
} from "../lib/evidence/core";
import { curatedEvidence } from "../lib/evidence/curated";
import { researchEvidence } from "../lib/evidence/provider";
import { EXAMPLES } from "../lib/data";
import type { EvidenceItem } from "../lib/evidence/types";
const item = (
  url = "https://example.com/story",
  stance: EvidenceItem["stance"] = "supports",
): EvidenceItem => ({
  title: "A source about adoption",
  url,
  publisher: "A publisher",
  author: null,
  publishedAt: null,
  kind: "article",
  stance,
  relationship: "independent",
  summary: "A concise factual source paraphrase.",
  relevance: "This supports part of the adoption hypothesis.",
});
const now = Date.parse("2026-09-29");
test("only observed, unique public source links survive; a social profile is not a post", () => {
  const first = item();
  const report = verifiedEvidence(
    {
      items: [
        first,
        { ...first, url: first.url + "?utm_source=share#title" },
        item("https://elsewhere.example/invented"),
        { ...item("https://x.com/user"), kind: "social" },
        { ...item("https://x.com/user/status/123"), kind: "social" },
      ],
      coverageNote: "These are selected sources, not a market poll.",
    },
    [
      { url: first.url },
      { url: "https://x.com/user" },
      { url: "https://x.com/user/status/123" },
    ],
    now,
  );
  assert.equal(report.items.length, 2);
  assert.match(report.coverageNote, /omitted/);
  assert.equal(
    canonicalEvidenceUrl(
      "https://www.twitter.com/User/status/123?utm_medium=share",
    ),
    "https://x.com/i/status/123",
  );
  assert.equal(
    canonicalEvidenceUrl("https://x.com/renamed/status/123?s=20&t=share"),
    canonicalEvidenceUrl("https://twitter.com/User/status/123"),
  );
  assert.equal(
    evidenceSentiment([
      { ...item("https://x.com/user/status/123"), kind: "social" },
      { ...item("https://twitter.com/User/status/123?s=20"), kind: "social" },
    ]).supports,
    1,
  );
  assert.equal(socialPermalink("not a url"), false);
  assert.equal(socialPermalink("https://x.com/i/trending/123"), false);
});
test("future and impossible publication dates are dropped instead of appearing as fresh news", () => {
  const items = ["2026-02-31", "2099-01-01", "2026-09-01"].map(
    (publishedAt, n) => ({ ...item(`https://example.com/${n}`), publishedAt }),
  );
  assert.deepEqual(
    verifiedEvidence(
      { items, coverageNote: "Selected historical and current sources." },
      items,
      now,
    ).items.map((i) => i.publishedAt),
    ["2026-09-01"],
  );
});
test("sentiment excludes context and duplicates and needs enough diverse directional sources", () => {
  assert.equal(evidenceSentiment([]).score, null);
  assert.equal(
    evidenceSentiment([
      item(),
      item("https://example.com/2"),
      { ...item("https://docs.example.com/3"), publisher: "Different label" },
    ]).score,
    null,
  );
  const sample = [
    item(),
    item("https://second.example/post", "challenges"),
    item("https://third.example/post"),
    item("https://fourth.example/post", "context"),
    item("https://example.com/story?utm_source=other"),
  ];
  assert.deepEqual(evidenceSentiment(sample), {
    supports: 2,
    challenges: 1,
    context: 1,
    publishers: 3,
    score: 67,
    label: "Leans supportive",
  });
});
test("editing conviction or weights invalidates a report; presentation-only changes do not", async () => {
  const thesis = EXAMPLES.find(t=>t.id==='gacha-collectibles')!,
    fingerprint = await evidenceFingerprint(thesis),
    report = (await curatedEvidence(thesis))!;
  assert.equal(reportIsStale(report, fingerprint, now), false);
  assert.equal(reportIsStale(report, fingerprint, now + 8 * 86400000), true);
  assert.notEqual(
    await evidenceFingerprint({
      ...thesis,
      body: "A completely different investment hypothesis",
    }),
    fingerprint,
  );
  assert.notEqual(
    await evidenceFingerprint({
      ...thesis,
      allocations: [{ symbol: "BTC", weight: 100 }],
    }),
    fingerprint,
  );
  assert.equal(
    await evidenceFingerprint({
      ...thesis,
      summary: "Edited presentation",
      allocations: [...thesis.allocations].reverse(),
    }),
    fingerprint,
  );
  assert.equal(
    await curatedEvidence({ ...thesis, body: "A different take altogether" }),
    null,
  );
  assert.equal(
    await curatedEvidence({ ...thesis, id: "a-new-custom-take" }),
    null,
  );
});
test("curated social items are direct posts and curated reports contain both sides without pretending to be AI", async () => {
  for (const id of [
    "gacha-collectibles",
    "privacy-repriced",
    "eth-to-7000",
    "launchpad-economy",
    "stock-tokens-win",
  ]) {
    const report = (await curatedEvidence(EXAMPLES.find((t) => t.id === id)!))!;
    assert.equal(report.basis, "curated");
    assert.ok(report.items.some((i) => i.stance === "supports"));
    assert.ok(report.items.some((i) => i.stance === "challenges"));
    for (const i of report.items.filter((i) => i.kind === "social"))
      assert.ok(socialPermalink(i.url));
  }
  const report = (await curatedEvidence(
    EXAMPLES.find((t) => t.id === "eth-to-7000")!,
  ))!;
  assert.equal(evidenceSentiment(report.items).score, null);
  assert.match(report.coverageNote, /does not identify/);
});
test("evidence provider requires web search and persists usage before validating the report", async () => {
  const report = {
    items: [item(), item("https://unknown.example/hallucinated")],
    coverageNote: "No verified social posts were available in the search.",
  };
  const raw = {
    id: "resp_test",
    model: "test-model",
    status: "completed",
    usage: { input_tokens: 20, output_tokens: 30 },
    output: [
      {
        type: "web_search_call",
        status: "completed",
        action: {
          sources: [{ url: "https://example.com/story", title: "Source" }],
        },
      },
      {
        type: "message",
        content: [{ type: "output_text", text: JSON.stringify(report) }],
      },
    ],
  };
  let saved: unknown, request: Record<string, unknown> | undefined;
  const fake = (async (_url: unknown, init: RequestInit) => {
    request = JSON.parse(init.body as string);
    return Response.json(raw);
  }) as typeof fetch;
  const result = await researchEvidence(
    EXAMPLES[0],
    "test-key",
    "test-model",
    fake,
    async (r) => {
      saved = r;
    },
  );
  assert.ok(saved);
  assert.equal(result.report.items.length, 1);
  assert.equal(request?.tool_choice, "required");
  assert.match(String(request?.instructions), /counterarguments/);
  assert.match(String(request?.instructions), /untrusted/);
  const invalid = {
    ...raw,
    output: raw.output.filter((o) => o.type !== "web_search_call"),
  };
  saved = null;
  await assert.rejects(
    researchEvidence(
      EXAMPLES[0],
      "test-key",
      "test-model",
      (async () => Response.json(invalid)) as typeof fetch,
      async (r) => {
        saved = r;
      },
    ),
    /did not finish/,
  );
  assert.ok(saved);
});

test("mislabelled social profiles cannot masquerade as articles", () => {
  const profile = item("https://x.com/someone"),
    post = item("https://x.com/someone/status/123");
  const result = verifiedEvidence(
    {
      items: [profile, post],
      coverageNote: "A selected source sample with one direct post.",
    },
    [profile, post],
    now,
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].kind, "social");
});

test("automatic research uses fresh cached reports and never calls an unconfigured provider", async () => {
  const report = (await curatedEvidence(EXAMPLES.find(t => t.id === "week-in-stables")!))!;
  const fresh = { ...report, basis: "ai" as const, generatedAt: now };
  assert.equal(shouldResearchAutomatically({ ready: false, report: null }, true, now), false);
  assert.equal(shouldResearchAutomatically({ ready: true, report: null }, false, now), false);
  assert.equal(shouldResearchAutomatically({ ready: true, report: null }, true, now), true);
  assert.equal(shouldResearchAutomatically({ ready: true, report }, true, now), true);
  assert.equal(shouldResearchAutomatically({ ready: true, report: fresh }, true, now + 6 * 3600000 - 1), false);
  assert.equal(shouldResearchAutomatically({ ready: true, report: fresh }, true, now + 6 * 3600000), true);
  assert.equal(shouldResearchAutomatically({ ready: true, report: fresh, stale: true }, true, now), true);
});

test("TLDR points keep source attribution, exclude context and never fabricate an absent side", () => {
  const source = item();
  const summary = evidenceTakeaways([
    source, { ...source, url: source.url + "?utm_source=duplicate" },
    item("https://second.example/supports"), item("https://third.example/supports"),
    item("https://second.example/context", "context"),
    item("http://localhost/invented", "challenges"),
  ]);
  assert.equal(summary.pros.length, 2);
  assert.equal(summary.pros[0].url, source.url + "?utm_source=duplicate");
  assert.equal(summary.pros[0].relevance, source.relevance);
  assert.deepEqual(summary.cons, []);
});

test("every editorial take has an automatically available dated source report", async () => {
  for (const thesis of EXAMPLES) {
    const report = await curatedEvidence(thesis);
    assert.ok(report, `Missing sources for ${thesis.id}`);
    assert.equal(report.fingerprint, await evidenceFingerprint(thesis));
    assert.equal(report.basis, "curated");
    assert.ok(report.items.some(i => i.stance === "challenges"), `No countercase for ${thesis.id}`);
  }
  const stables = (await curatedEvidence(EXAMPLES.find(t => t.id === "week-in-stables")!))!;
  assert.ok(stables.items.some(i => i.stance === "supports"));
  assert.match(stables.items.find(i => i.stance === "challenges")!.relevance, /no yield/);
});
