import { EXAMPLES } from './data';
import type { Thesis } from './data';
import type { Creator } from './creators';
import type { CreatorStats } from './creator-stats';
import { storedThesis } from './thesis-store';

export type PublicInvestment = {
  thesis: Thesis;
  active: boolean;
  firstInvestedAt: number;
  lastInvestedAt: number;
};
export type PublicProfile = {
  creator: Creator;
  stats: CreatorStats;
  theses: Thesis[];
  investments: PublicInvestment[];
  investmentsVisible: boolean;
  followerCount: number;
  followingCount: number;
};

type InvestmentRow = {
  thesis_id: string;
  first_invested_at: number;
  last_invested_at: number;
  active: number;
  payload: string | null;
  owner: string | null;
  visibility: string | null;
  artwork_id: string | null;
  artwork_status: string | null;
  closed_at: number | null;
  archived_at: number | null;
};

// Publish only public calls and named investments here. Wallet balances,
// position amounts, orders, and private calls never enter the public response.
export async function publicInvestments(db: D1Database, userId: string): Promise<PublicInvestment[]> {
  const rows = await db.prepare(`
    SELECT o.thesis_id, MIN(o.created_at) AS first_invested_at,
      MAX(o.created_at) AS last_invested_at,
      EXISTS(SELECT 1 FROM positions p WHERE p.user_id=o.user_id AND p.thesis_id=o.thesis_id AND p.amount>0) AS active,
      t.payload,t.owner,t.visibility,t.artwork_id,t.closed_at,t.archived_at,a.status AS artwork_status
    FROM orders o
    LEFT JOIN theses t ON t.id=o.thesis_id
    LEFT JOIN take_identities a ON a.id=t.artwork_id
    WHERE o.user_id=? AND o.side='buy'
      AND (t.id IS NULL OR (t.visibility='public' AND t.archived_at IS NULL))
    GROUP BY o.thesis_id
    ORDER BY last_invested_at DESC,o.thesis_id LIMIT 100
  `).bind(userId).all<InvestmentRow>();
  return rows.results.flatMap(row => {
    const thesis = row.payload
      ? storedThesis({ ...row, payload: row.payload, owner: row.owner!, visibility: row.visibility! })
      : EXAMPLES.find(t => t.id === row.thesis_id);
    return thesis ? [{thesis, active: row.active === 1,
      firstInvestedAt: row.first_invested_at, lastInvestedAt: row.last_invested_at}] : [];
  });
}

export async function profileFollowCounts(db: D1Database, userId: string) {
  const result = await db.prepare(`SELECT
    (SELECT COUNT(*) FROM people_follows WHERE followee_id=?) AS followers,
    (SELECT COUNT(*) FROM people_follows WHERE follower_id=?) AS following
  `).bind(userId, userId).first<{followers:number;following:number}>();
  return {followerCount: result?.followers ?? 0, followingCount: result?.following ?? 0};
}
