import { EDITORIAL_CREATOR } from "./creators";
import { publicCreator, type CreatorRow } from "./creators";
import { EXAMPLES, EXAMPLE_UPDATES } from "./data";
import type { Person, PeoplePage, PeopleState, ContactMatch } from "./people";

type PersonRow = CreatorRow & { take_count: number; follower_count: number };
const columns = `p.*,(SELECT COUNT(*) FROM theses t WHERE t.owner=p.user_id AND t.visibility='public') AS take_count,(SELECT COUNT(*) FROM people_follows f WHERE f.followee_id=p.user_id) AS follower_count`;
const person = (row: PersonRow): Person => ({
  creator: publicCreator(row),
  takeCount: row.take_count,
  followerCount: row.follower_count,
});
export class PeopleError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function peopleState(
  db: D1Database,
  userId?: string,
): Promise<PeopleState> {
  if (!userId) return { signedIn: false, selfId: null, followingIds: [] };
  const [self, followed] = await Promise.all([
    db
      .prepare("SELECT id FROM creator_profiles WHERE user_id=?")
      .bind(userId)
      .first<{ id: string }>(),
    db
      .prepare(
        "SELECT COALESCE(p.id,f.followee_id) AS id FROM people_follows f LEFT JOIN creator_profiles p ON p.user_id=f.followee_id WHERE f.follower_id=? ORDER BY f.created_at DESC,f.followee_id",
      )
      .bind(userId)
      .all<{ id: string }>(),
  ]);
  return {
    signedIn: true,
    selfId: self?.id || userId,
    followingIds: followed.results.map((r) => r.id),
  };
}
export async function listPeople(
  db: D1Database,
  userId: string | undefined,
  query: string,
  following: boolean,
  offset: number,
): Promise<PeoplePage> {
  const pattern = `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const where = `p.user_id<>? AND (p.name LIKE ? ESCAPE '\\' OR p.twitter_handle LIKE ? ESCAPE '\\')${following ? " AND EXISTS(SELECT 1 FROM people_follows f WHERE f.follower_id=? AND f.followee_id=p.user_id)" : ""}`;
  const values = [
    userId || "",
    pattern,
    pattern,
    ...(following ? [userId || ""] : []),
  ];
  const editorialMatches =
    !query ||
    EDITORIAL_CREATOR.name.toLowerCase().includes(query.toLowerCase());
  const editorialFollow =
    following && editorialMatches
      ? await db
          .prepare(
            "SELECT 1 AS present FROM people_follows WHERE follower_id=? AND followee_id='editorial'",
          )
          .bind(userId || "")
          .first()
      : null;
  const includeEditorial =
    editorialMatches && (!following || !!editorialFollow);
  const editorialCount = Number(includeEditorial);
  const [count, rows] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS count FROM creator_profiles p WHERE ${where}`,
      )
      .bind(...values)
      .first<{ count: number }>(),
    db
      .prepare(
        `SELECT ${columns} FROM creator_profiles p WHERE ${where} ORDER BY p.name COLLATE NOCASE,p.id LIMIT ? OFFSET ?`,
      )
      .bind(
        ...values,
        40 - (offset === 0 ? editorialCount : 0),
        Math.max(0, offset - editorialCount),
      )
      .all<PersonRow>(),
  ]);
  const people = rows.results.map(person);
  if (includeEditorial && offset === 0) {
    const count = await db
      .prepare(
        "SELECT COUNT(*) AS count FROM people_follows WHERE followee_id='editorial'",
      )
      .first<{ count: number }>();
    people.unshift({
      creator: EDITORIAL_CREATOR,
      takeCount: EXAMPLES.filter((t) => !EXAMPLE_UPDATES[t.id]).length,
      followerCount: count?.count || 0,
    });
  }
  const total = (count?.count || 0) + editorialCount;
  return {
    people,
    total,
    nextOffset: offset + people.length < total ? offset + people.length : null,
  };
}
export async function matchContacts(
  db: D1Database,
  userId: string,
  handles: string[],
): Promise<ContactMatch[]> {
  const results: PersonRow[] = [];
  for (let i = 0; i < handles.length; i += 60) {
    const batch = handles.slice(i, i + 60).map((h) => h.toLowerCase());
    const found = await db
      .prepare(
        `SELECT ${columns} FROM creator_profiles p WHERE p.user_id<>? AND lower(p.twitter_handle) IN (${batch.map(() => "?").join(",")}) ORDER BY p.name COLLATE NOCASE,p.id`,
      )
      .bind(userId, ...batch)
      .all<PersonRow>();
    results.push(...found.results);
  }
  return handles.map((handle) => ({
    handle,
    people: results
      .filter((p) => p.twitter_handle.toLowerCase() === handle.toLowerCase())
      .map(person),
  }));
}
export async function setPeopleFollowing(
  db: D1Database,
  userId: string,
  creatorIds: string[],
  following: boolean,
): Promise<PeopleState> {
  const targets = [...new Set(creatorIds)];
  if (!targets.length || targets.length > 100)
    throw new PeopleError("Select between 1 and 100 people.");
  const followees: string[] = [];
  const identities = new Map<string, string>();
  // Batch identity lookups below D1's parameter limit. Handles may change; account IDs do not.
  const profiles = targets.filter((id) => id !== "editorial");
  for (let i = 0; i < profiles.length; i += 40) {
    const batch = profiles.slice(i, i + 40),
      placeholders = batch.map(() => "?").join(",");
    const rows = await db
      .prepare(
        `SELECT id,user_id FROM creator_profiles WHERE id IN (${placeholders}) OR user_id IN (${placeholders})`,
      )
      .bind(...batch, ...batch)
      .all<{ id: string; user_id: string }>();
    for (const row of rows.results) {
      identities.set(row.id, row.user_id);
      identities.set(row.user_id, row.user_id);
    }
  }
  const missing = profiles.filter((id) => !identities.has(id));
  for (let i = 0; i < missing.length; i += 80) {
    const batch = missing.slice(i, i + 80);
    const rows = await db
      .prepare(
        `SELECT DISTINCT owner FROM theses WHERE visibility='public' AND owner IN (${batch.map(() => "?").join(",")})`,
      )
      .bind(...batch)
      .all<{ owner: string }>();
    for (const row of rows.results) identities.set(row.owner, row.owner);
  }
  for (const id of targets) {
    const followee = id === "editorial" ? id : identities.get(id);
    if (!followee)
      throw new PeopleError(
        "One of these profiles is no longer available. Refresh and try again.",
        404,
      );
    if (followee === userId)
      throw new PeopleError("You cannot follow your own profile.");
    followees.push(followee);
  }
  const now = Date.now();
  await db.batch(
    [...new Set(followees)].map((id) =>
      following
        ? db
            .prepare(
              "INSERT OR IGNORE INTO people_follows (follower_id,followee_id,created_at) VALUES (?,?,?)",
            )
            .bind(userId, id, now)
        : db
            .prepare(
              "DELETE FROM people_follows WHERE follower_id=? AND followee_id=?",
            )
            .bind(userId, id),
    ),
  );
  return peopleState(db, userId);
}
