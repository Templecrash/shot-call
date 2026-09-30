"use client";
import Link from "next/link";
import { Users } from "lucide-react";
import { CreatorAvatar } from "@/components/creator";
import {MAX_VISIBLE_INVESTORS,type ThesisInvestment} from "@/lib/thesis-investments";

export function CardInvestors({
  investment,
  loading,
  onCreator,
}: {
  investment: ThesisInvestment | null;
  loading: boolean;
  onCreator?: (id: string) => void;
}) {
  if (!investment)
    return (
      <div className="card-investors pending" aria-busy={loading}>
        <span className="card-investor-people">
          <Users size={22} />
          <span>
            {loading ? "Loading investors…" : "Investor data unavailable"}
          </span>
        </span>
      </div>
    );
  const { investors, profiles } = investment;
  const visibleProfiles = profiles.slice(0,MAX_VISIBLE_INVESTORS);
  const others = Math.max(0,investors-visibleProfiles.length);
  return (
    <div
      className="card-investors"
      aria-label={`${investors} ${investors === 1 ? "investor" : "investors"}`}
    >
      <div className="card-investor-people">
        <div className="card-investor-stack" aria-label="Featured investors by position size">
          {visibleProfiles.map((profile,index) => (
            <Link
              key={profile.id}
              href={`/creator/${encodeURIComponent(profile.id)}`}
              prefetch={false}
              style={{zIndex:MAX_VISIBLE_INVESTORS-index}}
              title={profile.handle ? `@${profile.handle}` : profile.name}
              aria-label={`View investor ${profile.handle ? `@${profile.handle}` : profile.name}`}
              onClick={
                onCreator
                  ? (e) => {
                      e.preventDefault();
                      onCreator(profile.id);
                    }
                  : undefined
              }
            >
              <CreatorAvatar creator={profile} />
            </Link>
          ))}
          {!visibleProfiles.length && (
            <span
              className="card-investor-anonymous"
              title={
                investors
                  ? "Investor profile photos unavailable"
                  : "No investors yet"
              }
            >
              <Users size={15} />
            </span>
          )}
          {others > 0 && (
            <span
              className="card-investor-overflow"
              title={`${others} more ${others === 1 ? "investor" : "investors"}`}
            >
              +{others > 999 ? "999+" : others}
            </span>
          )}
        </div>
        <span className="card-investor-count">
          <strong>{investors.toLocaleString("en-US")}</strong>
          <span>{investors === 1 ? "investor" : "investors"}</span>
        </span>
      </div>
    </div>
  );
}
