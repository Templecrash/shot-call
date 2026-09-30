"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { UserPlus, UserCheck, Loader2 } from "lucide-react";
import type { PeopleState } from "@/lib/people";
import type { Creator } from "@/lib/creators";

type PeopleContextValue = PeopleState & {
  loading: boolean;
  busy: boolean;
  error: string;
  revision: number;
  refresh: () => Promise<void>;
  setFollowing: (ids: string[], following: boolean) => Promise<void>;
};
const PeopleContext = createContext<PeopleContextValue | null>(null);
const initial: PeopleState = {
  signedIn: false,
  selfId: null,
  followingIds: [],
};
export function PeopleProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(initial),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const lock = useRef(false),
    generation = useRef(0);
  const load = useCallback(async (signal?: AbortSignal) => {
    const request = ++generation.current;
    try {
      const r = await fetch("/api/people?mode=state", { signal });
      const data = (await r.json()) as PeopleState & { error?: string };
      if (!r.ok)
        throw new Error(data.error || "Could not load the people you follow.");
      if (!signal?.aborted && request === generation.current) {
        setState(data);
        setError("");
      }
    } catch (e) {
      if (!signal?.aborted && request === generation.current)
        setError((e as Error).message);
    } finally {
      if (!signal?.aborted && request === generation.current) setLoading(false);
    }
  }, []);
  const refresh = useCallback(() => load(), [load]);
  useEffect(() => {
    const abort = new AbortController();
    void load(abort.signal);
    return () => abort.abort();
  }, [load]);
  const setFollowing = useCallback(
    async (ids: string[], following: boolean) => {
      if (lock.current)
        throw new Error("Wait for your current follow change to finish.");
      lock.current = true;
      setBusy(true);
      ++generation.current;
      try {
        const r = await fetch("/api/people", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ creatorIds: ids, following }),
        });
        const data = (await r.json()) as PeopleState & { error?: string };
        if (!r.ok)
          throw new Error(
            data.error || "Could not update your following list.",
          );
        setState(data);
        setError("");
        setLoading(false);
        setRevision((n) => n + 1);
      } finally {
        lock.current = false;
        setBusy(false);
      }
    },
    [],
  );
  return (
    <PeopleContext.Provider
      value={{
        ...state,
        loading,
        busy,
        error,
        revision,
        refresh,
        setFollowing,
      }}
    >
      {children}
    </PeopleContext.Provider>
  );
}
export function usePeople() {
  const value = useContext(PeopleContext);
  if (!value) throw new Error("PeopleProvider is required.");
  return value;
}
export function FollowPersonButton({ creator }: { creator: Creator }) {
  const p = usePeople(),
    [error, setError] = useState("");
  if (p.selfId === creator.id || !creator.id) return null;
  const following = p.followingIds.includes(creator.id);
  if (!p.loading && !p.error && !p.signedIn)
    return (
      <a
        className="people-follow"
        href={`/signin-with-chatgpt?return_to=${encodeURIComponent(`/creator/${creator.id}`)}`}
        target="_top"
      >
        <UserPlus size={14} /> Follow
      </a>
    );
  return (
    <div className="people-follow-control">
      <button
        type="button"
        className={`people-follow ${following ? "is-following" : ""}`}
        disabled={p.loading || p.busy || !!p.error}
        aria-label={`${following ? "Unfollow" : "Follow"} ${creator.handle ? "@" + creator.handle : creator.name}`}
        onClick={async () => {
          setError("");
          try {
            await p.setFollowing([creator.id], !following);
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      >
        {p.busy ? (
          <Loader2 className="spin" size={14} />
        ) : following ? (
          <UserCheck size={14} />
        ) : (
          <UserPlus size={14} />
        )}
        {following ? "Unfollow" : "Follow"}
      </button>
      {following && <span className="people-follow-status">Following</span>}
      {(error || p.error) && (
        <span className="people-inline-error" role="alert">
          {error || p.error}
          {p.error && (
            <button className="text-button" onClick={p.refresh}>
              Retry
            </button>
          )}
        </span>
      )}
    </div>
  );
}
