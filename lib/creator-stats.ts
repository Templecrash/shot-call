import { EXAMPLES } from './data';
import type { Creator } from './creators';
import { paperRankings, type BoardOrder, type BoardPosition } from './leaderboard';

export type CreatorStats = {
  takeCount: number;
  investmentCount: number | null;
  weeklyPnlCents: number | null;
  pnlVisibility: 'public' | 'private' | 'unavailable' | 'not-applicable';
};

// Counts describe public activity. The only money figure published here is the
// weekly P&L a creator has already opted to share on the leaderboard.
export async function creatorStats(db: D1Database, userId: string, creator: Creator, now = Date.now()): Promise<CreatorStats> {
  const [takes, investments] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM theses WHERE owner=? AND visibility='public' AND archived_at IS NULL")
      .bind(userId).first<{ count: number }>(),
    creator.publicInvestments ? db.prepare(`SELECT COUNT(DISTINCT o.thesis_id) AS count
      FROM orders o LEFT JOIN theses t ON t.id=o.thesis_id
      WHERE o.user_id=? AND o.side='buy' AND
        ((t.id IS NOT NULL AND t.visibility='public' AND t.archived_at IS NULL)
          OR (t.id IS NULL AND o.thesis_id IN (SELECT value FROM json_each(?))))`)
      .bind(userId, JSON.stringify(EXAMPLES.map(t => t.id))).first<{ count: number }>() : Promise.resolve(null),
  ]);
  const stats: CreatorStats = { takeCount: takes?.count ?? 0,
    investmentCount: investments?.count ?? null,
    weeklyPnlCents: null, pnlVisibility: creator.leaderboardOptIn ? 'unavailable' : 'private' };
  if (!creator.leaderboardOptIn) return stats;
  const [account, orders, positions] = await Promise.all([
    db.prepare('SELECT balance FROM accounts WHERE user_id=?').bind(userId).first<{ balance: number }>(),
    db.prepare(`SELECT id,user_id AS userId,thesis_id AS thesisId,side,amount,
      creator_fee AS creatorFee,trading_fee AS tradingFee,platform_profit_fee AS platformProfitFee,created_at AS createdAt
      FROM orders WHERE user_id=? ORDER BY created_at ASC,rowid ASC LIMIT 50001`).bind(userId).all<BoardOrder>(),
    db.prepare('SELECT user_id AS userId,thesis_id AS thesisId,amount FROM positions WHERE user_id=? LIMIT 50001')
      .bind(userId).all<BoardPosition>(),
  ]);
  if (!account || orders.results.length > 50000 || positions.results.length > 50000) return stats;
  const scores = paperRankings([{ userId, balance: account.balance, creator, enrolled: true }],
    orders.results, positions.results, 'week', now);
  if (scores.excluded) return stats;
  return { ...stats, weeklyPnlCents: scores.investors[0]?.profitCents ?? 0, pnlVisibility: 'public' };
}
