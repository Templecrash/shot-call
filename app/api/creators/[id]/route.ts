import { attachCreators } from '@/lib/creator-store';
import { publicInvestments, profileFollowCounts } from '@/lib/public-profile';
import {storedThesis} from "@/lib/thesis-store";
import { database } from "@/db/raw";
import { EDITORIAL_CREATOR, creatorFor } from "@/lib/creators";
import { publicCreator, type CreatorRow } from "@/lib/creator-store";
import { EXAMPLES } from "@/lib/data";
import { creatorStats } from '@/lib/creator-stats';
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (id === "editorial")
      return Response.json({
        creator: EDITORIAL_CREATOR,
        stats: { takeCount: EXAMPLES.filter(t => t.id !== 'gacha-supercycle').length,
          investmentCount: 0, weeklyPnlCents: null, pnlVisibility: 'not-applicable' },
        investments: [], investmentsVisible: true, ...(await profileFollowCounts(database(), "editorial")),
        theses: EXAMPLES.filter((t) => t.id !== "gacha-supercycle").map(
          (t) => ({ ...t, creator: EDITORIAL_CREATOR }),
        ),
      });
    const db = database();
    const row = await db
      .prepare("SELECT * FROM creator_profiles WHERE id=? OR user_id=?")
      .bind(id, id)
      .first<CreatorRow>();
    const rows = await db
      .prepare(
        "SELECT t.payload,t.owner,t.visibility,t.artwork_id,t.closed_at,t.archived_at,a.status AS artwork_status FROM theses t LEFT JOIN take_identities a ON a.id=t.artwork_id WHERE t.owner=? AND t.visibility='public' AND t.archived_at IS NULL ORDER BY t.created_at DESC LIMIT 200",
      )
      .bind(row?.user_id || id)
      .all<{payload:string;owner:string;visibility:string;artwork_id:string|null;artwork_status:string|null;closed_at:number|null;archived_at:number|null}>();
    const theses = rows.results.map(storedThesis);
    if (!row && !theses.length)
      return Response.json(
        { error: "This creator profile could not be found." },
        { status: 404 },
      );
    const creator = row ? publicCreator(row) : creatorFor(theses[0]);
    const investmentsVisible = row?.public_investments === 1;
    const [investments, counts, stats] = await Promise.all([
      investmentsVisible ? publicInvestments(db, row!.user_id) : Promise.resolve([]),
      profileFollowCounts(db, row?.user_id || id),
      creatorStats(db, row?.user_id || id, creator),
    ]);
    const attached = await attachCreators(investments.map(i => i.thesis));
    return Response.json(
      { creator, stats, theses: theses.map((t) => ({ ...t, creator })), investments: investments.map((i,n) => ({...i,thesis:attached.theses[n]})), investmentsVisible, ...counts },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "This profile is unavailable right now. Please retry." },
      { status: 503 },
    );
  }
}
