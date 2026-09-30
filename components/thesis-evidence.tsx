"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Link2,
  Loader2,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import type { Thesis } from "@/lib/data";
import { tokenFor } from "@/lib/token-catalog";
import { TokenIconImage } from "@/components/token-icon";
import { publicUrl } from "@/lib/ai/urls";
import { evidenceSentiment, evidenceTakeaways, shouldResearchAutomatically } from "@/lib/evidence/core";
import type { EvidenceItem, EvidenceResponse } from "@/lib/evidence/types";
const date = (value: string | number) =>
  new Date(
    typeof value === "string" ? `${value}T12:00:00Z` : value,
  ).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
const relationship = {
  project: "Project perspective",
  independent: "Independent source",
  regulator: "Regulatory perspective",
  community: "Community perspective",
};
function SourceCard({ item }: { item: EvidenceItem }) {
  return (
    <article className={`evidence-source ${item.stance}`}>
      <div className="evidence-source-meta">
        <span>
          {item.kind === "social" ? (
            <MessageCircle size={14} />
          ) : (
            <BookOpen size={14} />
          )}{" "}
          {item.author || item.publisher}
        </span>
        <span>
          {item.publishedAt ? (
            <time dateTime={item.publishedAt}>{date(item.publishedAt)}</time>
          ) : (
            "Date not confirmed"
          )}
        </span>
      </div>
      <a
        className="evidence-source-title"
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {item.title}
        <ArrowUpRight size={19} />
      </a>
      <p>{item.summary}</p>
      <div className="evidence-relevance">
        <span>WHY IT MATTERS · OUR READING</span>
        <p>{item.relevance}</p>
      </div>
      <div className="evidence-source-foot">
        <span>{relationship[item.relationship]}</span>
        <a href={item.url} target="_blank" rel="noopener noreferrer">
          {item.kind === "social" ? "Read post" : "Read source"}{" "}
          <ArrowUpRight size={13} />
        </a>
      </div>
    </article>
  );
}
function delay(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, 2500);
    signal.addEventListener("abort", abort, { once: true });
  });
}
export function ThesisEvidence({
  thesis,
  signedIn,
}: {
  thesis: Thesis;
  signedIn: boolean;
}) {
  const [data, setData] = useState<EvidenceResponse | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [filter, setFilter] = useState<"all" | "articles" | "social">("all"),
    [copied, setCopied] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const base = `/api/evidence?thesisId=${encodeURIComponent(thesis.id)}`;
  const receive = useCallback((next: EvidenceResponse) => {
    setData(next);
    setError("");
  }, []);
  const recover = useCallback(
    async (id: string, signal: AbortSignal) => {
      for (let n = 0; n < 72; n++) {
        const r = await fetch(`${base}&id=${encodeURIComponent(id)}`, {
            signal,
          }),
          next = (await r.json()) as EvidenceResponse;
        if (!r.ok)
          throw new Error(next.error || "Could not load this research.");
        if (r.status !== 202) {
          receive(next);
          return;
        }
        await delay(signal);
      }
      throw new Error(
        "Research is taking longer than expected. Try loading again in a moment.",
      );
    },
    [base, receive],
  );
  const load = useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setBusy(false);
    setError("");
    try {
      const id = new URLSearchParams(location.search).get("evidence");
      if (id) await recover(id, current.signal);
      else {
        const r = await fetch(base, { signal: current.signal }),
          next = (await r.json()) as EvidenceResponse;
        if (!r.ok) throw new Error(next.error || "Could not load sources.");
        receive(next);
        setLoading(false);
        if (shouldResearchAutomatically(next, signedIn)) {
          setBusy(true);
          const requestId = crypto.randomUUID();
          let response: Response;
          try {
            response = await fetch("/api/evidence", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: requestId, thesisId: thesis.id }),
              signal: current.signal,
            });
          } catch (e) {
            if (current.signal.aborted) throw e;
            await recover(requestId, current.signal);
            return;
          }
          const researched = (await response.json()) as EvidenceResponse;
          if (!response.ok) throw new Error(researched.error || "Research could not finish.");
          if (response.status === 202) await recover(researched.pendingId || requestId, current.signal);
          else receive(researched);
        }
      }
    } catch (e) {
      if (!current.signal.aborted)
        setError(e instanceof Error ? e.message : "Could not load sources.");
    } finally {
      if (!current.signal.aborted) { setLoading(false); setBusy(false); }
    }
  }, [base, recover, receive, signedIn, thesis.id]);
  useEffect(() => {
    let disposed=false;
    queueMicrotask(()=>{if(!disposed)void load();});
    return () => {disposed=true;controller.current?.abort();};
  }, [load]);
  const report = data?.report,
    sentiment = evidenceSentiment(report?.items || []),
    stale = !!data?.stale;
  const takeaways = evidenceTakeaways(report?.items || []);
  const items = (report?.items || []).filter(
    (i) =>
      filter === "all" ||
      (filter === "social" ? i.kind === "social" : i.kind !== "social"),
  );
  const reportUrl = report
    ? `/take/${encodeURIComponent(thesis.id)}?evidence=${encodeURIComponent(report.id)}#evidence`
    : "";
  async function copy() {
    if(thesis.visibility==="private")return;
    try {
      await navigator.clipboard.writeText(
        new URL(reportUrl, location.origin).href,
      );
      setCopied(true);
    } catch {
      setError("Copy the report link below to share these sources.");
    }
  }
  return (
    <section
      id="evidence"
      className="thesis-evidence"
      aria-labelledby="evidence-title"
    >
      <div className="evidence-heading">
        <div>
          <h2 id="evidence-title">TL;DR</h2>
          <p>The pros and cons, backed by sources.</p>
        </div>
        {report && <span className="evidence-basis">{report.basis === "ai" ? "Researched" : "Reviewed"} {date(report.generatedAt)}</span>}
      </div>
      {(loading || busy) && (
        <p className="evidence-status" role="status">
          <Loader2 className="spin" size={16} />
          {busy
            ? "Researching both sides automatically…"
            : "Loading saved sources…"}
        </p>
      )}
      {error && (
        <div className="evidence-error" role="alert">
          <p>{error}</p>
          <button onClick={load}>
            <RefreshCw size={14} /> Retry loading
          </button>
          {new URLSearchParams(
            typeof location === "undefined" ? "" : location.search,
          ).has("evidence") && (
            <button
              onClick={() => {
                const url = new URL(location.href);
                url.searchParams.delete("evidence");
                window.history.replaceState({}, "", url);
                void load();
              }}
            >
              Show latest saved report
            </button>
          )}
        </div>
      )}
      {report && (
        <>
          {stale && <p className="evidence-summary-note">Earlier research — the take or its sources may have changed since this was written.</p>}
          <div className="evidence-tldr" aria-label="Pros and cons summary">
            {(["pros", "cons"] as const).map(side => (
              <div key={side} className={`evidence-tldr-side ${side}`}>
                <h3>{side === "pros" ? "Pros" : "Cons"}</h3>
                {takeaways[side].length ? <ul>{takeaways[side].map(item => <li key={item.url}>
                  <p>{item.relevance}</p>
                  <a href={item.url} target="_blank" rel="noopener noreferrer">{item.publisher} <ArrowUpRight size={13}/></a>
                </li>)}</ul> : <p className="evidence-tldr-gap">No verified {side === "pros" ? "supporting arguments" : "counterarguments"} in this source sample.</p>}
              </div>
            ))}
          </div>
          <div className={`evidence-pulse ${stale ? "stale" : ""}`}>
            <div className="evidence-pulse-heading">
              <span className="eyebrow">SOURCE SENTIMENT</span>
              <span className="evidence-basis">
                {report.basis === "curated"
                  ? "Curated reading list"
                  : "AI research"}{" "}
                · {report.basis === "curated" ? "Reviewed" : "Searched"}{" "}
                {date(report.generatedAt)}
              </span>
            </div>
            <div className="evidence-pulse-main">
              <div>
                <h3>{stale ? "Ready for a fresh look" : sentiment.label}</h3>
                <p>
                  {stale
                    ? "This report is more than 7 days old or the take has changed. Its sentiment is withheld until refreshed."
                    : sentiment.score === null
                      ? "A broader set of directional sources is needed before showing a score."
                      : `${sentiment.score}% of directional sources in this report support the take.`}
                </p>
              </div>
              <div className="evidence-counts">
                <span>
                  <b>{sentiment.supports}</b> supporting
                </span>
                <span>
                  <b>{sentiment.challenges}</b> challenging
                </span>
                <span>
                  <b>{sentiment.context}</b> context
                </span>
              </div>
            </div>
            {!stale && sentiment.score !== null && (
              <div className="evidence-meter-wrap">
                <div
                  className="evidence-meter"
                  role="meter"
                  aria-label="Supporting share of directional sources"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={sentiment.score}
                  aria-valuetext={`${sentiment.score} percent of directional sources are supportive`}
                >
                  <span style={{ width: `${sentiment.score}%` }} />
                </div>
                <div className="evidence-meter-labels">
                  <span>Supports</span>
                  <span>Challenges</span>
                </div>
              </div>
            )}
            <p className="evidence-coverage">{report.coverageNote}</p>
            <details className="evidence-method">
              <summary>How to read this indicator</summary>
              <p>
                Supportive sources ÷ (supportive + challenging sources). Context
                is excluded. At least 3 directional sources across 2 source
                domains or social accounts are needed. Links are deduplicated,
                but opinions are not weighted for credibility or independence.
                The score always uses the full report, even when a filter is
                selected.
              </p>
              <p>
                This is the balance of a selected source sample, not a
                whole-market poll, live social feed or probability of profit.
                Project sources may be promotional. Dates refer to the original
                source; older sources can remain in a newly reviewed report.
              </p>
            </details>
          </div>
          <div className="evidence-toolbar">
            <div
              className="evidence-filters"
              aria-label="Filter research sources"
            >
              {(["all", "articles", "social"] as const).map((f) => (
                <button
                  key={f}
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                >
                  {f === "all"
                    ? "All sources"
                    : f === "articles"
                      ? "Articles & research"
                      : "Social posts"}
                  <span>
                    {
                      report.items.filter(
                        (i) =>
                          f === "all" ||
                          (f === "social"
                            ? i.kind === "social"
                            : i.kind !== "social"),
                      ).length
                    }
                  </span>
                </button>
              ))}
            </div>
            {thesis.visibility!=="private"&&<button className="evidence-copy" onClick={copy}>
              {copied ? <Check size={14} /> : <Link2 size={14} />}{" "}
              {copied ? "Link copied" : "Share research"}
            </button>}
          </div>
          <div className="evidence-columns">
            {(["supports", "challenges"] as const).map((stance) => (
              <div className="evidence-column" key={stance}>
                <h3>
                  <i className={stance} />
                  {stance === "supports" ? "The case for" : "The case against"}
                  <span>{items.filter((i) => i.stance === stance).length}</span>
                </h3>
                {items
                  .filter((i) => i.stance === stance)
                  .map((item) => (
                    <SourceCard key={item.url} item={item} />
                  ))}
                {!items.some((i) => i.stance === stance) && (
                  <div className="evidence-no-sources">
                    {filter === "social"
                      ? "No verified public posts in this part of the report."
                      : `No ${stance === "supports" ? "supporting" : "challenging"} sources in this selection.`}
                    <span>
                      A gap in coverage, not proof that{" "}
                      {stance === "supports"
                        ? "supporting evidence"
                        : "counterarguments"}{" "}
                      do not exist.
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
          {items.some((i) => i.stance === "context") && (
            <div className="evidence-context">
              <h3>More context</h3>
              <div>
                {items
                  .filter((i) => i.stance === "context")
                  .map((item) => (
                    <SourceCard key={item.url} item={item} />
                  ))}
              </div>
            </div>
          )}
          <div className="evidence-report-link">
            <a href={reportUrl}>
              <Link2 size={13} /> Open this saved report
            </a>
            <span>Research for: “{report.take}”</span>
          </div>
        </>
      )}
      {!report && !loading && !error && (
        <div className="evidence-empty">
          <BookOpen size={25} />
          <h3>No research report yet</h3>
          <p>
            There isn’t a source-backed summary for this take yet. The project links below describe what’s in the basket.
          </p>
          <span>No source sample · sentiment not available</span>
        </div>
      )}
      <div className="evidence-token-sources">
        <div>
          <span className="eyebrow">INSIDE THE BASKET</span>
          <h3>Project sources</h3>
          <p>Project links and token identities for what’s included.</p>
        </div>
        <div className="evidence-token-list">
          {thesis.allocations.map((a) => {
            const t = tokenFor(thesis, a.symbol);
            return (
              <div key={a.symbol}>
                <span
                  className="evidence-token-mark"
                  style={{ background: t.color }}
                >
                  <TokenIconImage token={t} symbol={a.symbol} alt=""/>
                </span>
                <span>
                  <b>{t.name}</b>
                  <small>
                    {t.symbol} · {a.weight}%
                  </small>
                </span>
                <div>
                  {publicUrl(t.source) && (
                    <a
                      href={t.source}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Project <ArrowUpRight size={13} />
                    </a>
                  )}
                  {t.identitySource && publicUrl(t.identitySource) && (
                    <a
                      href={t.identitySource}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Token identity <ArrowUpRight size={13} />
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="evidence-directory-note">
          These links identify the projects in the basket. Inclusion is not
          evidence that their tokens will benefit from the thesis.
        </p>
      </div>
      {!!thesis.research?.sources.length && (
        <details className="evidence-additional">
          <summary>
            More sources from token selection ({thesis.research.sources.length})
          </summary>
          {thesis.research.sources
            .filter((s) => publicUrl(s.url))
            .map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {s.title}
                <ArrowUpRight size={13} />
              </a>
            ))}
        </details>
      )}
    </section>
  );
}
