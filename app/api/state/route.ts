import {DEFAULT_PERFORMANCE_FEE_BPS,MAX_PERFORMANCE_FEE_BPS,FEE_POLICY} from '@/lib/performance-fees';
import {retireSentiment} from '@/lib/retire-sentiment';
import {hasPerps,validateExecution} from '@/lib/creator-execution';
import {loadCreatorCoverage} from '@/lib/perps';
import {saveCreatorExits,adoptCreatorExits,ExitPlanError} from '@/lib/creator-exits';
import {exitPlanSchema,validateExitPlan} from '@/lib/exit-plan';
import { readThesis, storedThesis } from "@/lib/thesis-store";
import { TRADING_FEE_BPS } from "@/lib/trading-fees";
import { MAX_THESIS_TOKENS } from "@/lib/limits";
import { paperTrade, followTake, TradeError } from "@/lib/paper-trading";
import { attachCreators, ownCreator, publicCreator } from "@/lib/creator-store";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
import { readThesisInvestments } from "@/lib/thesis-investments";
import { EXAMPLES, TOKENS, type Thesis } from "@/lib/data";
import { z } from "zod";
import { validateCounter, type CounterStrategy } from '@/lib/counter-strategy';
import {savedCounterDraft} from '@/lib/counter-store';
import {COUNTER_MODEL,validateGeneratedCounter,validateCounterOutcomes} from '@/lib/counter-generation';
import {manageTake,isTakeLive,TakeLifecycleError} from '@/lib/take-lifecycle';
const alloc = z
  .array(
    z.object({
      symbol: z.string().min(1).max(110),
      weight: z.number().int().min(0).max(100),
      side: z.enum(['long','short']).optional(),
      execution:z.enum(['spot','perps']).optional(),leverage:z.number().int().min(1).max(10).optional(),
    }),
  )
  .min(1)
  .max(
    MAX_THESIS_TOKENS,
    `A thesis can contain at most ${MAX_THESIS_TOKENS} tokens, including USDC.`,
  )
  .refine(
    (a) =>
      a.reduce((s, x) => s + x.weight, 0) === 100 &&
      new Set(a.map((x) => x.symbol)).size === a.length,
    "Allocations must total 100% with unique tokens.",
  );
const thesisSchema = z.object({
  performanceFeeBps:z.number().int().min(0).max(MAX_PERFORMANCE_FEE_BPS).default(DEFAULT_PERFORMANCE_FEE_BPS),
  exitPlan:exitPlanSchema.optional(),
  id: z.string().max(80),
  title: z.string().min(3).max(90),
  body: z.string().min(8).max(1500),
  summary: z.string().max(180),
  category: z.string().max(40),
  allocations: alloc,
  engine: z.enum(["curated", "ai"]),
  risk: z.string().max(600),
  evidenceNote: z.string().max(600).optional(),
  parent: z.string().max(80).optional(),
  counter: z.object({sourceId:z.string().min(1).max(80),sourceVersion:z.number().int().min(1),generationId:z.string().uuid().optional()}).optional(),
  generationId: z.string().uuid().optional(),
  artworkId: z.string().uuid().optional(),
});
export async function GET(req:Request) {
  try {
    const db = database(),
      user = await getChatGPTUser();
    await retireSentiment(db);
    const requestedId=new URL(req.url).searchParams.get('thesisId')?.slice(0,80)||'';
    const rows = await db
      .prepare(
        "SELECT t.payload,t.owner,t.visibility,t.artwork_id,t.closed_at,t.archived_at,a.status AS artwork_status FROM theses t LEFT JOIN take_identities a ON a.id=t.artwork_id WHERE t.visibility='public' AND ((t.closed_at IS NULL AND t.archived_at IS NULL) OR t.id=? OR EXISTS(SELECT 1 FROM positions p WHERE p.thesis_id=t.id AND p.user_id=? AND p.amount>0) OR EXISTS(SELECT 1 FROM orders o WHERE o.thesis_id=t.id AND o.user_id=?) OR EXISTS(SELECT 1 FROM thesis_follows f WHERE f.thesis_id=t.id AND f.user_id=? AND f.active=1)) ORDER BY t.created_at DESC LIMIT 200",
      )
      .bind(requestedId,user?.userId||'',user?.userId||'',user?.userId||'')
      .all<{ payload: string; owner: string; visibility:string;artwork_id:string|null;artwork_status:string|null;closed_at:number|null;archived_at:number|null }>();
    if(user){
      const own=await db.prepare("SELECT t.payload,t.owner,t.visibility,t.artwork_id,t.closed_at,t.archived_at,a.status AS artwork_status FROM theses t LEFT JOIN take_identities a ON a.id=t.artwork_id WHERE t.owner=? ORDER BY t.created_at DESC").bind(user.userId).all<{payload:string;owner:string;visibility:string;artwork_id:string|null;artwork_status:string|null;closed_at:number|null;archived_at:number|null}>();
      const visibleIds=new Set(rows.results.map(r=>(JSON.parse(r.payload) as Thesis).id));
      rows.results.push(...own.results.filter(r=>!visibleIds.has((JSON.parse(r.payload) as Thesis).id)));
    }
    let account = null;
    let positions: unknown[] = [];
    let orders: unknown[] = [];
    let follows: unknown[] = [];
    if (user) {
      await db
        .prepare("INSERT OR IGNORE INTO accounts (user_id) VALUES (?)")
        .bind(user.userId)
        .run();
      account = await db
        .prepare(
          "SELECT balance, revision, default_buy_amount AS defaultBuyAmount, demo_wallet_connected AS demoConnected FROM accounts WHERE user_id = ?",
        )
        .bind(user.userId)
        .first();
      positions = (
        await db
          .prepare(
            "SELECT id, thesis_id AS thesisId, amount, invested, take_profit AS takeProfit, stop_loss AS stopLoss,share_eligible AS shareEligible,share_realized AS shareRealized,share_high_water AS shareHighWater,share_paid AS sharePaid, platform_realized AS platformRealized,platform_high_water AS platformHighWater,platform_paid AS platformPaid, execution_mode AS executionMode, leverage, perp_notional AS perpNotional, perp_weight AS perpWeight, maintenance_bps AS maintenanceBps, perp_markets AS perpMarkets,exit_state AS exitState,execution_state AS executionState,fee_terms AS feeTerms FROM positions WHERE user_id = ? AND amount > 0",
          )
          .bind(user.userId)
          .all()
      ).results;
      orders = (
        await db
          .prepare(
            "SELECT id, thesis_id AS thesisId, side, amount,cost_basis AS costBasis,creator_fee AS creatorFee, trading_fee AS tradingFee,platform_profit_fee AS platformProfitFee,fee_policy AS feePolicy, execution_mode AS executionMode,leverage,execution_reason AS executionReason, created_at AS createdAt FROM orders WHERE user_id = ? ORDER BY created_at DESC,rowid DESC LIMIT 20",
          )
          .bind(user.userId)
          .all()
      ).results;
      follows = (
        await db
          .prepare(
            "SELECT thesis_id AS thesisId,active,accepted_at AS acceptedAt FROM thesis_follows WHERE user_id=? AND active=1",
          )
          .bind(user.userId)
          .all()
      ).results;
    }
    const theses: Thesis[] = [
      ...rows.results.map(storedThesis),
      ...EXAMPLES,
    ];
    const [enriched, thesisInvestments] = await Promise.all([
      attachCreators(theses, user?.userId),
      readThesisInvestments(
        db,
        theses.map((t) => t.id),
      ),
    ]);
    return Response.json(
      {
        user: user
          ? {
              id: user.userId,
              name: user.fullName?.split(" ")[0] || "Collector",
              creator: enriched.own,
            }
          : null,
        account,
        positions,
        orders,
        follows,
        theses: enriched.theses,
        thesisInvestments,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error(e);
    return Response.json(
      { error: "Saved takes are unavailable right now. Please retry." },
      { status: 503 },
    );
  }
}
export async function POST(req: Request) {
  try {
    const user = await getChatGPTUser();
    if (!user)
      return Response.json(
        { error: "Sign in to save a take or paper trade." },
        { status: 401 },
      );
    if (
      req.headers.get("origin") &&
      new URL(req.headers.get("origin")!).host !== new URL(req.url).host
    )
      return Response.json({ error: "Invalid origin" }, { status: 403 });
    const db = database();
    await retireSentiment(db);
    const b = z.record(z.unknown()).parse(await req.json());
    const id = z.string().min(1).max(100).parse(b.id);
    await db
      .prepare("INSERT OR IGNORE INTO accounts (user_id) VALUES (?)")
      .bind(user.userId)
      .run();
    if (b.action === "save") {
      const t = thesisSchema.parse(b.thesis);
      const visibility=z.enum(["private","public"]).parse(b.visibility);
      const profile = await ownCreator(user.userId);
      if (visibility==='public' && !profile)
        return Response.json(
          {
            error:
              "Add your Twitter/X profile before publishing so people can see who created this take.",
            code: "creator_profile_required",
          },
          { status: 409 },
        );
      const rawOwner=await db.prepare("SELECT owner FROM theses WHERE id=?").bind(t.id).first<{owner:string}>();
      if(rawOwner && rawOwner.owner!==user.userId)return Response.json({error:"This take is unavailable."},{status:404});
      const existing = await readThesis(db,t.id,user.userId);
      if(!existing&&visibility!=='public')return Response.json({error:"New takes are published when you confirm. Keep editing until you’re ready to publish."},{status:400});
      if(existing&&!isTakeLive(existing))return Response.json({error:'This take is closed or removed. Make a copy for a new take.'},{status:409});
      if(existing?.visibility==='private'&&visibility==='public')return Response.json({error:'Save your changes, then use Publish on the take page to share this existing private take.'},{status:409});
      if(existing?.visibility==='public' && visibility==='private')return Response.json({error:"Published takes stay public."},{status:409});
      if (existing && existing.owner !== user.userId)
        return Response.json(
          { error: "Fork this take to make it your own." },
          { status: 403 },
        );
      if (existing) {
        const holdings = await db
          .prepare(
            "SELECT COUNT(*) AS n FROM positions WHERE thesis_id = ? AND amount > 0",
          )
          .bind(t.id)
          .first<{ n: number }>();
        if (holdings?.n)
          return Response.json(
            {
              error:
                "This take has active holdings. Fork a new version to preserve everyone’s basket.",
            },
            { status: 409 },
          );
      }
      let researchBase =
        existing || (t.parent ? await readThesis(db,t.parent,user.userId) : undefined);
      if(t.parent && !researchBase)return Response.json({error:"The original take is unavailable."},{status:404});
      let counter:CounterStrategy|undefined;
      let counterBase:Thesis|undefined;
      if(t.counter){
        if(t.counter.sourceId!==t.parent || t.counter.sourceId===t.id)return Response.json({error:'A counter must link to its original take.'},{status:400});
        const original=await readThesis(db,t.counter.sourceId,user.userId);
        if(!original)return Response.json({error:'The original take is unavailable.'},{status:404});
        try{
          if(t.counter.generationId){
            counterBase=await savedCounterDraft(db,t.counter.generationId,user.userId);
            counter=validateGeneratedCounter(original,t.counter.sourceVersion,t.allocations,counterBase);
          }else{
            if(!existing?.counter||existing.counter.generationId)throw new Error('Generate the counter assets before saving a new counter call.');
            counter=validateCounter(original,t.counter.sourceVersion,t.allocations);
          }
        }catch(e){return Response.json({error:(e as Error).message},{status:409});}
      }else if(existing?.counter){return Response.json({error:'Keep the counter’s original link when adjusting it.'},{status:400});}
      if(t.artworkId){const art=await db.prepare("SELECT 1 FROM take_identities WHERE id=? AND owner=? AND thesis_id=?").bind(t.artworkId,user.userId,t.id).first();if(!art)return Response.json({error:"This image belongs to a different draft."},{status:400});}
      if (t.generationId && researchBase?.generationId !== t.generationId) {
        const generation = await db
          .prepare(
            "SELECT result FROM generations WHERE id=? AND owner=? AND status='complete' AND model<>?",
          )
          .bind(t.generationId, user.userId,COUNTER_MODEL)
          .first<{ result: string }>();
        if (!generation)
          return Response.json(
            {
              error:
                "The AI draft could not be verified. Generate a new draft or fork a saved take.",
            },
            { status: 400 },
          );
        researchBase = JSON.parse(generation.result).thesis as
          Thesis | undefined;
      }
      const tokenData = (counterBase||researchBase)?.tokens || {};
      if (
        t.allocations.some(
          (a) =>
            !Object.hasOwn(TOKENS, a.symbol) &&
            !Object.hasOwn(tokenData, a.symbol),
        )
      )
        return Response.json(
          {
            error:
              "A token has not been verified for this draft. Research it with AI first.",
          },
          { status: 400 },
        );
      const verifiedResearch = counter?undefined:researchBase?.research;
      if(t.allocations.some(a=>a.side==='short'&&a.execution!=='perps'&&!['stock','prediction'].includes((tokenData[a.symbol]||TOKENS[a.symbol])?.instrument||'')&&!(existing?.counter&&!existing.counter.generationId&&existing.allocations.some(original=>original.symbol===a.symbol&&original.side==='short'&&original.weight>0))))return Response.json({error:'Crypto shorts require a verified perp contract. Generate counter assets or select an eligible perp.'},{status:400});
      if(t.allocations.some(a=>a.symbol==='USDC'&&a.side==='short'))return Response.json({error:'USDC is a cash reserve and cannot be shorted.'},{status:400});
      if(t.exitPlan)validateExitPlan(t.exitPlan,t);
      const thesis = {
        ...t,
        executionVersion:1 as const,
        counter,
        engine: verifiedResearch ? "ai" : "curated",
        generationId: verifiedResearch ? researchBase?.generationId : undefined,
        tokens: Object.keys(tokenData).length ? tokenData : undefined,
        research: verifiedResearch,
        owner: user.userId,
        author: profile?.name || user.fullName || "You",
        visibility,
        createdAt: existing?.createdAt || Date.now(),
        version: (existing?.version || 0) + 1,
        example: false,
      };
      validateExecution(thesis as Thesis,hasPerps(thesis as Thesis)?await loadCreatorCoverage(thesis as Thesis,true):null);
      await validateCounterOutcomes(thesis as Thesis);
      const saved=await db
        .prepare(
          "INSERT INTO theses (id,owner,payload,created_at,visibility,artwork_id) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,visibility=excluded.visibility,artwork_id=excluded.artwork_id WHERE theses.owner=excluded.owner AND theses.visibility=excluded.visibility AND theses.closed_at IS NULL AND theses.archived_at IS NULL AND json_extract(theses.payload,'$.version')=? AND NOT EXISTS(SELECT 1 FROM positions WHERE thesis_id=excluded.id AND amount>0)",
        )
        .bind(t.id, user.userId, JSON.stringify(thesis), thesis.createdAt,visibility,t.artworkId||null,existing?.storageVersion??existing?.version??0)
        .run();
      if(!saved.meta.changes)throw new TakeLifecycleError("This take changed or gained an investor while you were editing. Refresh and make a copy to continue.");
      return Response.json({
        thesis: { ...thesis, creator: profile ? publicCreator(profile) : undefined },
      });
    }
    const thesisId = z.string().max(80).parse(b.thesisId);
    const thesis = await readThesis(db,thesisId,user.userId);
    if (!thesis)
      return Response.json(
        { error: "This take no longer exists." },
        { status: 404 },
      );
    if(b.action==='close'||b.action==='archive'||b.action==='restore')return Response.json(await manageTake(db,user.userId,thesisId,b.action));
    if(b.action==='publish'){
      if(!isTakeLive(thesis))return Response.json({error:'Make a new copy of this closed take to publish again.'},{status:409});
      if(thesis.owner!==user.userId)return Response.json({error:'Only the creator can publish this take.'},{status:403});
      const profile=await ownCreator(user.userId);
      if(!profile)return Response.json({error:'Add your Twitter/X profile before publishing.',code:'creator_profile_required'},{status:409});
      validateExecution(thesis,hasPerps(thesis)?await loadCreatorCoverage(thesis,true):null);
      await validateCounterOutcomes(thesis);
      await db.prepare("UPDATE theses SET visibility='public',payload=json_set(payload,'$.visibility','public','$.author',?) WHERE id=? AND owner=? AND closed_at IS NULL AND archived_at IS NULL").bind(profile.name,thesisId,user.userId).run();
      return Response.json({ok:true});
    }
    if (b.action === "follow" || b.action === "unfollow")
      return Response.json(
        await followTake(
          db,
          user.userId,
          thesis,
          b.action === "follow",
          b.acceptProfitShare === true,
        ),
      );
    if(b.action==='creator-exits')return Response.json(await saveCreatorExits(db,user.userId,thesis,b.plan,z.string().max(80).nullable().parse(b.previousPlanId)));
    if(b.action==='adopt-exits')return Response.json(await adoptCreatorExits(db,user.userId,thesis,z.string().min(1).max(80).parse(b.exitPlanId)));
    if (b.action === "rules") {
      const p = await db
        .prepare("SELECT amount,execution_state FROM positions WHERE user_id=? AND thesis_id=?")
        .bind(user.userId, thesisId)
        .first<{ amount: number;execution_state:string|null }>();
      if (!p?.amount)
        throw new Error("Buy this take with paper funds before setting rules.");
      if(p.execution_state)throw new TradeError("Exit rules are set by the creator and saved with your investment. You can still sell manually.",409);
      const tp = z
        .number()
        .int()
        .min(1)
        .max(1000)
        .nullable()
        .parse(b.takeProfit);
      const sl = z.number().int().min(1).max(99).nullable().parse(b.stopLoss);
      await db.batch([
        db.prepare("UPDATE positions SET take_profit=?,stop_loss=? WHERE user_id=? AND thesis_id=?").bind(tp,sl,user.userId,thesisId),
        db.prepare('UPDATE accounts SET revision=revision+1 WHERE user_id=?').bind(user.userId),
      ]);
      return Response.json({ ok: true });
    }
    const action = z.enum(["buy", "sell", "simulate"]).parse(b.action);
    if (b.tradingFeeBps !== TRADING_FEE_BPS || b.feePolicy!==FEE_POLICY)
      return Response.json(
        {
          error:
            "Fees have changed. Refresh and review the entry and published performance fees before confirming.",
        },
        { status: 409 },
      );
    return Response.json(
      await paperTrade(db, user.userId, thesis, {
        id,
        configKey:z.string().max(16000).optional().parse(b.configKey),
        action,
        amount: z.number().int().min(1).max(100000000).parse(b.amount),
        change:
          action === "simulate"
            ? z.number().int().min(-90).max(100).parse(b.change)
            : undefined,
        acceptProfitShare: b.acceptProfitShare === true,
        executionMode: z
          .enum(["spot", "perps"])
          .optional()
          .parse(b.executionMode),
        leverage: z.number().int().min(1).max(10).optional().parse(b.leverage),
        acceptRisk: b.acceptRisk === true,
        exitPlanId:z.string().min(1).max(80).nullable().optional().parse(b.exitPlanId),
      }),
    );
  } catch (e) {
    console.error(e);
    return Response.json(
      {
        error:
          e instanceof z.ZodError
            ? e.issues.some((issue) => issue.path.includes("allocations"))
              ? `Use 1–${MAX_THESIS_TOKENS} tokens, including USDC, with unique tokens and weights totaling 100%.`
              : "Check the values and ensure allocations total 100%."
            : e instanceof Error
              ? e.message
              : "Unable to save. Try again.",
      },
      { status: e instanceof TradeError || e instanceof TakeLifecycleError || e instanceof ExitPlanError ? e.status : 400 },
    );
  }
}
