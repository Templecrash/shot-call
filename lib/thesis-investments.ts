import { publicCreator, type Creator, type CreatorRow } from "./creators";

export const MAX_VISIBLE_INVESTORS = 3;

export type ThesisInvestment = {
  investors: number;
  aum: number;
  profiles: Creator[];
};

/** Shared paper holdings only. Predictions, cash and browser wallet journals are separate. */
export async function readThesisInvestments(
  db: D1Database,
  thesisIds: readonly string[],
): Promise<Record<string, ThesisInvestment>> {
  const ids = [...new Set(thesisIds)];
  const totals: Record<string, ThesisInvestment> = Object.fromEntries(
    ids.map((id) => [id, { investors: 0, aum: 0, profiles: [] }]),
  );
  for (let i = 0; i < ids.length; i += 80) {
    const batch = ids.slice(i, i + 80);
    const placeholders = batch.map(() => "?").join(",");
    const [amounts, people] = await db.batch([
      db
        .prepare(
          `SELECT thesis_id,COUNT(DISTINCT user_id) AS investors,SUM(amount) AS aum FROM positions WHERE amount>0 AND thesis_id IN (${placeholders}) GROUP BY thesis_id`,
        )
        .bind(...batch),
      db
        .prepare(
          `WITH visible AS (SELECT p.thesis_id,c.*,ROW_NUMBER() OVER (PARTITION BY p.thesis_id ORDER BY p.amount DESC,c.id) AS sample_rank FROM positions p JOIN creator_profiles c ON c.user_id=p.user_id WHERE p.amount>0 AND c.leaderboard_opt_in=1 AND c.avatar_key IS NOT NULL AND c.avatar_key<>'' AND p.thesis_id IN (${placeholders})) SELECT * FROM visible WHERE sample_rank<=${MAX_VISIBLE_INVESTORS} ORDER BY thesis_id,sample_rank`,
        )
        .bind(...batch),
    ]);
    for (const row of amounts.results as {
      thesis_id: string;
      investors: number;
      aum: number;
    }[]) {
      if (
        !Number.isSafeInteger(row.investors) ||
        row.investors < 1 ||
        !Number.isSafeInteger(row.aum) ||
        row.aum < 1
      )
        throw new Error("Invalid thesis investment aggregate.");
      totals[row.thesis_id] = {
        investors: row.investors,
        aum: row.aum,
        profiles: [],
      };
    }
    for (const row of people.results as (CreatorRow & { thesis_id: string })[])
      totals[row.thesis_id].profiles.push(publicCreator(row));
  }
  return totals;
}
