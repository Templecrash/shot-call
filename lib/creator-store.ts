import { database } from "@/db/raw";
import { type Creator, EDITORIAL_CREATOR } from "./creators";
import type { Thesis } from "./data";

import { publicCreator, type CreatorRow } from "./creators";
export { publicCreator, type CreatorRow } from "./creators";
export async function ownCreator(userId: string) {
  return database()
    .prepare("SELECT * FROM creator_profiles WHERE user_id=?")
    .bind(userId)
    .first<CreatorRow>();
}
export async function attachCreators(theses: Thesis[], ownUserId?: string) {
  const ids = [
    ...new Set([
      ...theses.map((t) => t.owner).filter((id): id is string => !!id),
      ...(ownUserId ? [ownUserId] : []),
    ]),
  ];
  const byOwner = new Map<string, Creator>();
  // Keep below D1's bound-parameter limit, including larger public feeds.
  for (let i = 0; i < ids.length; i += 80) {
    const batch = ids.slice(i, i + 80);
    const rows = await database()
      .prepare(
        `SELECT * FROM creator_profiles WHERE user_id IN (${batch.map(() => "?").join(",")})`,
      )
      .bind(...batch)
      .all<CreatorRow>();
    rows.results.forEach((row) => byOwner.set(row.user_id, publicCreator(row)));
  }
  return {
    theses: theses.map((t) => ({
      ...t,
      creator: t.example
        ? EDITORIAL_CREATOR
        : byOwner.get(t.owner || "") || {
            id: t.owner || "",
            name: t.author || "Creator",
            handle: null,
            twitterUrl: null,
            avatarUrl: null,
            bio: "",
          },
    })),
    own: ownUserId ? byOwner.get(ownUserId) || null : null,
  };
}
