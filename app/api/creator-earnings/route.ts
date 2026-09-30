import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
export async function GET() {
  const user = await getChatGPTUser();
  if (!user)
    return Response.json(
      { error: "Sign in to see your creator earnings." },
      { status: 401 },
    );
  try {
    const db = database();
    const [totals, followers, investors, byTake, recent] = await db.batch([
      db
        .prepare(
          "SELECT COALESCE(SUM(amount),0) AS earned,COUNT(*) AS payouts FROM creator_earnings WHERE creator_id=?",
        )
        .bind(user.userId),
      db
        .prepare(
          "SELECT COUNT(DISTINCT user_id) AS count FROM thesis_follows WHERE creator_id=? AND active=1",
        )
        .bind(user.userId),
      db
        .prepare(
          "SELECT COUNT(DISTINCT user_id) AS count FROM positions WHERE share_creator=? AND (share_eligible=1 OR fee_terms IS NOT NULL) AND amount>0",
        )
        .bind(user.userId),
      db
        .prepare(
          "SELECT thesis_id AS thesisId,SUM(amount) AS earned,COUNT(*) AS payouts FROM creator_earnings WHERE creator_id=? GROUP BY thesis_id ORDER BY earned DESC",
        )
        .bind(user.userId),
      db
        .prepare(
          "SELECT order_id AS id,thesis_id AS thesisId,amount,created_at AS createdAt FROM creator_earnings WHERE creator_id=? ORDER BY created_at DESC LIMIT 20",
        )
        .bind(user.userId),
    ]);
    return Response.json(
      {
        basis: "paper",
        feePolicy: "v3",
        ...(totals.results[0] as { earned: number; payouts: number }),
        followers: (followers.results[0] as { count: number }).count,
        investors: (investors.results[0] as { count: number }).count,
        byTake: byTake.results,
        recent: recent.results,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("Creator earnings unavailable", error);
    return Response.json(
      { error: "Creator earnings are unavailable. Please retry." },
      { status: 503 },
    );
  }
}
