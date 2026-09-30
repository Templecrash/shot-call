"use client";
import { BookOpen, ExternalLink, Sparkles } from "lucide-react";
import { tokenFor } from "@/lib/token-catalog";
import type { Thesis } from "@/lib/data";
import type { AIResearch } from "@/lib/ai/types";
export function AIResearchNotes({
  research,
  body,
  compact = false,
}: {
  research: AIResearch;
  body?: string;
  compact?: boolean;
}) {
  return (
    <section
      className={`ai-research-notes ${compact ? "compact" : ""}`}
      aria-label="AI research and sources"
    >
      <div className="ai-research-heading">
        <Sparkles size={16} />
        <b>Researched for your take</b>
        <span>
          {new Date(research.generatedAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            timeZone: "UTC",
          })}
        </span>
      </div>
      {body && body !== research.take && (
        <p className="ai-research-stale">
          Your take changed after this research. Refresh AI research to reassess
          the matches.
        </p>
      )}
      <p>{research.allocationRationale}</p>
      {research.notes && <p className="ai-research-caveat">{research.notes}</p>}
      {research.watchlist.length > 0 && (
        <details className="ai-watchlist">
          <summary>
            {research.watchlist.length} candidates kept outside the basket
          </summary>
          {research.watchlist.map((c, i) => (
            <article key={`${c.name}:${i}`}>
              <b>
                {c.name} <span>{c.symbol}</span>
              </b>
              <p>{c.reason}</p>
              {c.source && (
                <a href={c.source} target="_blank" rel="noopener noreferrer">
                  Project source <ExternalLink size={11} />
                </a>
              )}
            </article>
          ))}
        </details>
      )}
      {research.sources.length > 0 && (
        <details className="ai-sources">
          <summary>
            <BookOpen size={13} /> Research sources · {research.sources.length}
          </summary>
          <div>
            {research.sources.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>{s.title}</span>
                <ExternalLink size={12} />
              </a>
            ))}
          </div>
        </details>
      )}
      <small>
        AI research can miss or misclassify projects. Token identity checks do
        not establish investment quality or wallet support. Review the sources
        and weights.
      </small>
    </section>
  );
}

export function AITokenReasons({ thesis }: { thesis: Thesis }) {
  return (
    <div className="ai-token-reasons">
      <h3>Why these tokens?</h3>
      {thesis.allocations
        .filter((a) => a.symbol !== "USDC")
        .map((a) => {
          const t = tokenFor(thesis, a.symbol);
          return (
            <details key={a.symbol}>
              <summary>
                {t.name}
                <span>{t.kind || "Review fit"}</span>
              </summary>
              <p>{t.reason}</p>
              <p className="risk-copy">{t.risk}</p>
              <div>
                <a href={t.source} target="_blank" rel="noopener noreferrer">
                  Project source <ExternalLink size={11} />
                </a>
                {t.identitySource && (
                  <a
                    href={t.identitySource}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Token identity <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </details>
          );
        })}
    </div>
  );
}
