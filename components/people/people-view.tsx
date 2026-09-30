"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Search,
  Users,
  UserPlus,
  Check,
  Loader2,
} from "lucide-react";
import { CreatorAvatar } from "@/components/creator";
import { FollowPersonButton, usePeople } from "./people-provider";
import {
  parseContactHandles,
  type ContactMatch,
  type Person,
  type PeoplePage,
} from "@/lib/people";

function PersonRow({
  person,
  onCreator,
  selection,
}: {
  person: Person;
  onCreator: (id: string) => void;
  selection?: { checked: boolean; disabled: boolean; onChange: () => void };
}) {
  const p = usePeople(),
    c = person.creator,
    following = p.followingIds.includes(c.id);
  return (
    <article className="person-row">
      {selection && (
        <input
          type="checkbox"
          checked={selection.checked}
          disabled={selection.disabled}
          onChange={selection.onChange}
          aria-label={`Select ${c.handle ? "@" + c.handle : c.name} (${c.name})`}
        />
      )}
      <a
        className="person-identity"
        href={`/creator/${encodeURIComponent(c.id)}`}
        target={selection ? "_blank" : undefined}
        rel={selection ? "noopener noreferrer" : undefined}
        onClick={(e) => {
          if (
            !selection &&
            !e.metaKey &&
            !e.ctrlKey &&
            !e.shiftKey &&
            !e.altKey
          ) {
            e.preventDefault();
            onCreator(c.id);
          }
        }}
      >
        <CreatorAvatar creator={c} />
        <span>
          <b>{c.name}</b>
          <span>
            {c.handle ? "@" + c.handle : "The editorial desk"}{" "}
            <ArrowUpRight size={12} />
          </span>
          <small>
            {person.takeCount} {person.takeCount === 1 ? "take" : "takes"}
            {!selection && (
              <>
                {" "}
                · {person.followerCount}{" "}
                {person.followerCount === 1 ? "follower" : "followers"}
              </>
            )}
          </small>
        </span>
      </a>
      {selection ? (
        following ? (
          <FollowPersonButton creator={c} />
        ) : (
          <span className="people-match-label">On Shot Call</span>
        )
      ) : (
        <FollowPersonButton creator={c} />
      )}
    </article>
  );
}
export function PeopleView({ onCreator }: { onCreator: (id: string) => void }) {
  const p = usePeople();
  const [tab, setTab] = useState<"discover" | "following" | "contacts">(
    "discover",
  );
  const [query, setQuery] = useState(""),
    [appliedQuery, setAppliedQuery] = useState("");
  const [page, setPage] = useState<PeoplePage | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0),
    [moreBusy, setMoreBusy] = useState(false);
  const directoryRequest = useRef(0);
  useEffect(() => {
    const value = new URLSearchParams(location.search).get("tab");
    if (value === "following" || value === "contacts") setTab(value);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setAppliedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (tab === "contacts") return;
    const abort = new AbortController(),
      request = ++directoryRequest.current;
    setLoading(true);
    setError("");
    setPage(null);
    setMoreBusy(false);
    const params = new URLSearchParams({
      q: appliedQuery,
      following: String(tab === "following"),
    });
    fetch(`/api/people?${params}`, { signal: abort.signal })
      .then(async (r) => {
        const data = (await r.json()) as PeoplePage & { error?: string };
        if (!r.ok) throw new Error(data.error || "Could not load people.");
        if (!abort.signal.aborted && request === directoryRequest.current)
          setPage(data);
      })
      .catch((e) => {
        if (!abort.signal.aborted && request === directoryRequest.current)
          setError(e.message);
      })
      .finally(() => {
        if (!abort.signal.aborted && request === directoryRequest.current)
          setLoading(false);
      });
    return () => {
      abort.abort();
      ++directoryRequest.current;
    };
  }, [appliedQuery, tab, retry, p.revision, p.signedIn]);
  async function more() {
    if (!page || page.nextOffset === null || moreBusy) return;
    const request = directoryRequest.current;
    setMoreBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({
        q: appliedQuery,
        following: String(tab === "following"),
        offset: String(page.nextOffset),
      });
      const r = await fetch(`/api/people?${params}`),
        data = (await r.json()) as PeoplePage & { error?: string };
      if (!r.ok) throw new Error(data.error || "Could not load more people.");
      if (request === directoryRequest.current)
        setPage((previous) =>
          previous
            ? {
                ...data,
                people: [
                  ...previous.people,
                  ...data.people.filter(
                    (n) =>
                      !previous.people.some(
                        (old) => old.creator.id === n.creator.id,
                      ),
                  ),
                ],
              }
            : data,
        );
    } catch (e) {
      if (request === directoryRequest.current) setError((e as Error).message);
    } finally {
      if (request === directoryRequest.current) setMoreBusy(false);
    }
  }
  function chooseTab(value: typeof tab) {
    setTab(value);
    setQuery("");
    setAppliedQuery("");
    window.history.replaceState({}, "", `/?view=contacts&tab=${value}`);
  }
  return (
    <section className="people-page">
      <div className="people-heading">
        <div>
          <h1>Contacts</h1>
          <p>Find creators and choose who appears in your feed.</p>
        </div>
        <div className="people-count">
          <strong>{p.loading || p.error ? "—" : p.followingIds.length}</strong>
          <span>following</span>
        </div>
      </div>
      <div
        className="people-tabs"
        role="tablist"
        aria-label="People views"
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          const buttons = Array.from(
            e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
          );
          const index = buttons.findIndex(
            (button) => button.getAttribute("aria-selected") === "true",
          );
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                  buttons.length;
          buttons[next]?.click();
          buttons[next]?.focus();
        }}
      >
        {(
          [
            ["discover", "Discover"],
            ["following", "Following"],
            ["contacts", "Find from X"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`people-tab-${value}`}
            aria-controls="people-tab-panel"
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => chooseTab(value)}
          >
            {value === "contacts" && <UserPlus size={15} />}
            {label}
            {value === "following" && !p.loading && (
              <span>{p.followingIds.length}</span>
            )}
          </button>
        ))}
      </div>
      <div
        id="people-tab-panel"
        role="tabpanel"
        aria-labelledby={`people-tab-${tab}`}
      >
        {p.error && (
          <div className="people-error" role="alert">
            {p.error}
            <button onClick={p.refresh}>Retry</button>
          </div>
        )}
        {tab === "contacts" ? (
          <ContactFinder onCreator={onCreator} />
        ) : (
          <>
            <label className="people-search">
              <Search size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                maxLength={100}
                placeholder="Search a name or @handle"
                aria-label="Search people"
              />
            </label>
            {loading ? (
              <div className="people-empty" role="status">
                <Loader2 size={21} className="spin" />
                <p>Loading people…</p>
              </div>
            ) : page?.people.length ? (
              <div className="people-list">
                {page.people.map((person) => (
                  <PersonRow
                    key={person.creator.id}
                    person={person}
                    onCreator={onCreator}
                  />
                ))}
              </div>
            ) : (
              !error && (
                <div className="people-empty">
                  <Users size={28} />
                  <h2>
                    {appliedQuery
                      ? "No matching people yet."
                      : tab === "following"
                        ? "No people followed yet."
                        : "No creators yet."}
                  </h2>
                  <p>
                    {appliedQuery
                      ? "Try another name or X handle."
                      : tab === "following"
                        ? "The people you choose to follow will appear here."
                        : "Creator profiles appear here when people join Shot Call."}
                  </p>
                  {tab === "following" && !p.signedIn ? (
                    <a
                      className="dark"
                      href="/signin-with-chatgpt?return_to=%2F%3Fview%3Dcontacts%26tab%3Dfollowing"
                      target="_top"
                    >
                      Sign in to follow people
                    </a>
                  ) : (
                    <button
                      className="outline"
                      onClick={() => chooseTab("contacts")}
                    >
                      Find your contacts <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>
              )
            )}
            {error && (
              <div className="people-error" role="alert">
                {error}
                <button
                  onClick={() =>
                    page?.people.length ? void more() : setRetry((n) => n + 1)
                  }
                >
                  Retry
                </button>
              </div>
            )}
            {page?.nextOffset !== null &&
              page?.nextOffset !== undefined &&
              !error && (
                <button
                  className="outline people-load-more"
                  disabled={moreBusy}
                  onClick={more}
                >
                  {moreBusy ? "Loading…" : "Load more people"}
                </button>
              )}
          </>
        )}
      </div>
      <p className="people-footnote">
        Following adds a creator’s takes to your feed. It does not invest your funds.
      </p>
    </section>
  );
}

function ContactFinder({ onCreator }: { onCreator: (id: string) => void }) {
  const p = usePeople();
  const [text, setText] = useState(""),
    [matches, setMatches] = useState<ContactMatch[] | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const parsed = parseContactHandles(text),
    abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const eligible = [
    ...new Set(
      (matches || []).flatMap((m) =>
        m.people.map((person) => person.creator.id),
      ),
    ),
  ].filter((id) => !p.followingIds.includes(id) && id !== p.selfId);
  const chosen = selected.filter((id) => eligible.includes(id));
  async function find(e: React.FormEvent) {
    e.preventDefault();
    if (
      !p.signedIn ||
      !parsed.handles.length ||
      parsed.invalid.length ||
      parsed.tooMany
    )
      return;
    const abort = new AbortController();
    abortRef.current?.abort();
    abortRef.current = abort;
    setBusy(true);
    setError("");
    setSuccess("");
    setMatches(null);
    setSelected([]);
    try {
      const r = await fetch("/api/people/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts: text }),
        signal: abort.signal,
      });
      const data = (await r.json()) as {
        matches: ContactMatch[];
        error?: string;
      };
      if (!r.ok)
        throw new Error(data.error || "Could not match your contacts.");
      if (!abort.signal.aborted) setMatches(data.matches);
    } catch (e) {
      if (!abort.signal.aborted) setError((e as Error).message);
    } finally {
      if (!abort.signal.aborted) setBusy(false);
    }
  }
  return (
    <div className="contact-finder">
      <div className="contacts-intro">
        <span className="contacts-x" aria-hidden="true">
          𝕏
        </span>
        <div>
          <h2>Find your contacts on X</h2>
          <p>
            Paste X handles or profile links to find people already on
            Shot Call. Then choose who to follow.
          </p>
        </div>
      </div>
      <form onSubmit={find}>
        <label className="field-label">
          X handles or profile links
          <textarea
            value={text}
            maxLength={12000}
            rows={4}
            spellCheck={false}
            autoCapitalize="none"
            placeholder={"@yourfriend\nhttps://x.com/anotherfriend"}
            onChange={(e) => {
              abortRef.current?.abort();
              setBusy(false);
              setText(e.target.value);
              setMatches(null);
              setSelected([]);
              setSuccess("");
              setError("");
            }}
          />
        </label>
        <div className="contacts-input-footer">
          <span>
            {parsed.handles.length} / 100 contacts · Separate with commas or new
            lines
          </span>
          {p.signedIn ? (
            <button
              className="dark"
              disabled={
                busy ||
                p.busy ||
                !parsed.handles.length ||
                !!parsed.invalid.length ||
                parsed.tooMany
              }
            >
              {busy ? (
                <>
                  <Loader2 size={15} className="spin" /> Finding matches…
                </>
              ) : (
                <>
                  <Search size={15} /> Find matches
                </>
              )}
            </button>
          ) : (
            <a
              className="dark"
              href="/signin-with-chatgpt?return_to=%2F%3Fview%3Dcontacts%26tab%3Dcontacts"
              target="_top"
            >
              Sign in to find contacts
            </a>
          )}
        </div>
      </form>
      {!!parsed.invalid.length && (
        <p className="form-error" role="alert">
          Remove invalid entries:{" "}
          {parsed.invalid
            .slice(0, 3)
            .map((s) => s.slice(0, 60))
            .join(", ")}
          {parsed.invalid.length > 3 ? "…" : ""}. Use handles or profile links,
          not post links.
        </p>
      )}
      {parsed.tooMany && (
        <p className="form-error" role="alert">
          Use up to 100 contacts at a time.
        </p>
      )}
      <p className="contacts-privacy">
        Your list is not saved. Choose who to follow after reviewing the matches.
      </p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="contacts-success" role="status">
          <Check size={16} />
          {success}
        </p>
      )}
      {matches && (
        <div className="contacts-results">
          <div className="contacts-results-header">
            <h3>
              {matches.filter((m) => m.people.length).length} of{" "}
              {matches.length} contacts found
            </h3>
            {eligible.length > 0 && (
              <button
                className="text-button"
                onClick={() =>
                  setSelected(
                    chosen.length === eligible.length
                      ? []
                      : eligible.slice(0, 100),
                  )
                }
                disabled={p.busy}
              >
                {chosen.length === eligible.length
                  ? "Clear selection"
                  : "Select available matches"}
              </button>
            )}
          </div>
          {matches.map((match) => (
            <div className="contact-match" key={match.handle.toLowerCase()}>
              {match.people.length > 1 && (
                <p className="contacts-duplicate">
                  Several profiles use @{match.handle}. Open them to choose the
                  right person.
                </p>
              )}
              {match.people.length ? (
                match.people.map((person) => (
                  <PersonRow
                    key={person.creator.id}
                    person={person}
                    onCreator={onCreator}
                    selection={{
                      checked: chosen.includes(person.creator.id),
                      disabled:
                        p.busy || p.followingIds.includes(person.creator.id),
                      onChange: () =>
                        setSelected((previous) =>
                          previous.includes(person.creator.id)
                            ? previous.filter((id) => id !== person.creator.id)
                            : previous.length < 100
                              ? [...previous, person.creator.id]
                              : previous,
                        ),
                    }}
                  />
                ))
              ) : (
                <div className="contact-unmatched">
                  <span>@{match.handle}</span>
                  <span>No other matching profile on Shot Call</span>
                </div>
              )}
            </div>
          ))}
          {eligible.length > 0 && (
            <div className="contacts-selection">
              <span>{chosen.length} selected</span>
              <button
                className="dark"
                disabled={!chosen.length || p.busy}
                onClick={async () => {
                  setError("");
                  setSuccess("");
                  const count = chosen.length;
                  try {
                    await p.setFollowing(chosen, true);
                    setSelected([]);
                    setSuccess(
                      `Following ${count} ${count === 1 ? "person" : "people"}. Their takes are now in your Following feed.`,
                    );
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                {p.busy ? (
                  <Loader2 size={15} className="spin" />
                ) : (
                  <UserPlus size={15} />
                )}{" "}
                Follow selected{chosen.length > 0 ? ` (${chosen.length})` : ""}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
