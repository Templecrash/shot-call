"use client";

import { useState } from "react";
import {
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Plus,
  Search,
} from "lucide-react";
import { TOKENS, type Thesis } from "@/lib/data";
import { TokenIconImage } from "@/components/token-icon";
import {
  GACHA_CANDIDATES,
  RESEARCH_DATE,
  ecosystemProducts,
  researchTopic,
} from "@/lib/research";

function ProjectMark({ name, symbol, image }: { name: string; symbol?: string; image?: string }) {
  const [failedSource,setFailedSource]=useState<string|null>(null);
  const projectImage=image||GACHA_CANDIDATES.find(c=>c.name===name)?.image;
  const token = symbol ? TOKENS[symbol] : undefined;
  return (
    <span
      className={`project-mark ${token ? "with-token" : projectImage ? "with-image" : ""}`}
      style={token ? { background: token.color } : undefined}
    >
      {token ? <TokenIconImage token={token} symbol={symbol!} alt=""/> : projectImage&&failedSource!==projectImage ? <img src={projectImage} alt={`${name} project logo`} onError={()=>setFailedSource(projectImage)}/> : name.slice(0, 1)}
    </span>
  );
}

export function ThesisResearch({
  thesis,
  onAdd,
}: {
  thesis: Thesis;
  onAdd: (symbol: string) => void;
}) {
  const [filter, setFilter] = useState("All");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [allProducts, setAllProducts] = useState(false);
  const productReviewDate=thesis.research?new Date(thesis.research.generatedAt).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"}):researchTopic(thesis)==='Vitalik portfolio'?'September 30, 2026':RESEARCH_DATE;
  const isGacha = researchTopic(thesis) === "Gacha & collectibles";
  const candidates = GACHA_CANDIDATES.filter(
    (c) =>
      (filter === "All" ||
        (filter === "Watchlist" ? !c.basketSymbol : c.kind === filter)) &&
      `${c.name} ${c.symbol} ${c.chain} ${c.description}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const products = ecosystemProducts(thesis);
  return (
    <div className="thesis-research">
      {isGacha && (
        <section className="research-universe" aria-labelledby="universe-title">
          <div className="research-heading">
            <div>
              <h2 id="universe-title">Related token candidates</h2>
            </div>
            <span className="research-count">
              {GACHA_CANDIDATES.length} token candidates
            </span>
          </div>
          <p className="research-intro">
            Physical-card gacha, digital NFT pools, and the ecosystems around
            them. Direct exposure comes first. Broader gaming and tokens
            awaiting verification stay clearly labeled.
          </p>
          <div className="research-controls">
            <div
              className="research-filters"
              role="group"
              aria-label="Filter token candidates"
            >
              {["All", "Direct", "Adjacent", "Infrastructure", "Watchlist"].map(
                (f) => (
                  <button
                    key={f}
                    aria-pressed={filter === f}
                    className={filter === f ? "active" : ""}
                    onClick={() => {
                      setFilter(f);
                      setExpanded(true);
                    }}
                  >
                    {f}
                    <span>
                      {
                        GACHA_CANDIDATES.filter(
                          (c) =>
                            f === "All" ||
                            (f === "Watchlist"
                              ? !c.basketSymbol
                              : c.kind === f),
                        ).length
                      }
                    </span>
                  </button>
                ),
              )}
            </div>
            <label className="research-search">
              <Search size={15} />
              <input
                aria-label="Search token candidates"
                placeholder="Find a project or token"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setExpanded(true);
                }}
              />
            </label>
          </div>
          <div className="candidate-list" aria-live="polite">
            {(expanded ? candidates : candidates.slice(0, 6)).map((c) => {
              const inBasket = thesis.allocations.some(
                (a) => a.symbol === c.basketSymbol,
              );
              return (
                <article className="candidate" key={c.id} data-project={c.id}>
                  <div className="candidate-main">
                    <ProjectMark name={c.name} symbol={c.basketSymbol} image={c.image} />
                    <div>
                      <h3>
                        {c.name}
                        <span>{c.symbol}</span>
                      </h3>
                      <div className="candidate-labels">
                        <span
                          className={`exposure-tag ${c.kind.toLowerCase()}`}
                        >
                          {c.kind}
                        </span>
                        <span>{c.chain}</span>
                      </div>
                    </div>
                    <span
                      className={`candidate-status ${!!c.basketSymbol ? "checked" : ""}`}
                    >
                      {!!c.basketSymbol && <Check size={12} />} {c.status}
                    </span>
                  </div>
                  <p>{c.description}</p>
                  {c.address && (
                    <details className="token-identity">
                      <summary>
                        Token identity <ChevronDown size={12} />
                      </summary>
                      <a
                        href={c.explorer}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {c.address}
                        <ArrowUpRight size={12} />
                      </a>
                    </details>
                  )}
                  <div className="candidate-bottom">
                    <a
                      href={c.source}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <BookOpen size={13} /> Project source{" "}
                      <ArrowUpRight size={12} />
                    </a>
                    {inBasket ? (
                      <span className="in-basket">
                        <Check size={12} /> In this basket
                      </span>
                    ) : c.basketSymbol && !thesis.counter ? (
                      <button onClick={() => onAdd(c.basketSymbol!)}>
                        <Plus size={13} /> Add to a fork
                      </button>
                    ) : (
                      <span className="watch-only">Watchlist only</span>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          {candidates.length === 0 && (
            <div className="research-empty">
              No matching projects in this reviewed directory.
              <button
                onClick={() => {
                  setQuery("");
                  setFilter("All");
                }}
              >
                Clear filters
              </button>
            </div>
          )}
          {!expanded && candidates.length > 6 && (
            <button
              className="research-expand"
              onClick={() => setExpanded(true)}
            >
              Explore all {candidates.length} candidates{" "}
              <ChevronDown size={14} />
            </button>
          )}
          <p className="research-footnote">
            Reviewed {RESEARCH_DATE} · Curated coverage, not an exhaustive live
            scan. “Identity checked” is a source check, not a safety rating.
            Watchlist tokens aren’t available for allocation. CARDS and FWA are
            paper-only in this app.
          </p>
        </section>
      )}
      {products.length > 0 && (
        <section
          className="ecosystem-section"
          aria-labelledby="ecosystem-title"
        >
          <div className="research-heading">
            <div>
              <span className="eyebrow">FOLLOW THE CONVICTION</span>
              <h2 id="ecosystem-title">Products & platforms</h2>
            </div>
            <span className="research-count">
              {products.length} products & platforms
            </span>
          </div>
          <p className="research-intro">
            See what’s being built. Explore the products behind the theme, with
            the role of each token made clear.
          </p>
          <div className="ecosystem-grid">
            {(allProducts ? products : products.slice(0, 6)).map((p) => (
              <a
                className="ecosystem-card"
                key={p.url}
                href={p.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <div className="ecosystem-card-top">
                  <ProjectMark name={p.name} symbol={p.symbol} />
                  <span>{p.type}</span>
                  <ArrowUpRight size={18} />
                </div>
                <h3>{p.name}</h3>
                <p>{p.description}</p>
                <div className="product-token-note">{p.tokenNote}</div>
                <small>{new URL(p.url).hostname.replace(/^www\./, "")}</small>
              </a>
            ))}
          </div>
          {!allProducts && products.length > 6 && (
            <button
              className="research-expand"
              onClick={() => setAllProducts(true)}
            >
              See all {products.length} products <ChevronDown size={14} />
            </button>
          )}
          <p className="research-footnote">
            Project links · Reviewed {productReviewDate}. A product listing
            doesn’t add its token to your basket. “Platform token not verified”
            means this review did not establish one.
          </p>
        </section>
      )}
    </div>
  );
}
