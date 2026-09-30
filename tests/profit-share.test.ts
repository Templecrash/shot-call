import {feeRates,feePercent,selectedFeeBps,startFeeTerms,settlePositionFees,readFeeTerms} from '../lib/performance-fees';
import {creatorConfigKey} from '../lib/creator-execution';
import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { paperTrade, followTake } from "../lib/paper-trading";
import { settleProfitShare, hasCreatorShare } from "../lib/profit-share";
import { EXAMPLES, type Thesis } from "../lib/data";
import { paperPerformance, type PaperOrder } from "../lib/performance";
import { paperRankings } from "../lib/leaderboard";

const thesis: Thesis = {
  // A long basket makes these fee tests independent of feed ordering.
  ...EXAMPLES.find(t=>t.id==='gacha-supercycle')!,
  id: "community",
  owner: "creator",
  example: false,
};
function fixture() {
  const sqlite = new DatabaseSync(":memory:");
  for (const name of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((n) => n.endsWith(".sql"))
    .sort())
    sqlite.exec(
      readFileSync(new URL(`../drizzle/${name}`, import.meta.url), "utf8"),
    );
  for (const id of ["follower", "creator"])
    sqlite.prepare("INSERT INTO accounts (user_id) VALUES (?)").run(id);
  let failAt = -1;
  class Statement {
    values: (string | number | null)[] = [];
    constructor(public sql: string) {}
    bind(...values: (string | number | null)[]) {
      this.values = values;
      return this;
    }
    async first() {
      return sqlite.prepare(this.sql).get(...this.values) || null;
    }
    async all() {
      return {
        results: sqlite.prepare(this.sql).all(...this.values),
        success: true,
      };
    }
    async run() {
      return {
        meta: sqlite.prepare(this.sql).run(...this.values),
        success: true,
      };
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((s, i) => {
          if (statements.length > 2 && i === failAt)
            throw new Error("Injected failure");
          if (s.sql.startsWith("SELECT"))
            return {
              results: sqlite.prepare(s.sql).all(...s.values),
              success: true,
            };
          return {
            results: [],
            meta: sqlite.prepare(s.sql).run(...s.values),
            success: true,
          };
        });
        sqlite.exec("COMMIT");
        return results;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  } as unknown as D1Database;
  const trade = (
    action: "buy" | "sell" | "simulate",
    amount: number,
    options: {
      change?: number;
      id?: string;
      acceptProfitShare?: boolean;
      user?: string;
      take?: Thesis;
    } = {},
  ) =>
    paperTrade(db, options.user || "follower", options.take || thesis, {
      configKey:creatorConfigKey(options.take||thesis),exitPlanId:(options.take||thesis).exitPlan?.id??null,
      id: options.id || crypto.randomUUID(),
      action,
      amount,
      change: options.change,
      acceptProfitShare: options.acceptProfitShare ?? true,
    });
  const get = (table: string, user = "follower") =>
    sqlite.prepare(`SELECT * FROM ${table} WHERE user_id=?`).get(user)!;
  return {
    sqlite,
    db,
    trade,
    get,
    fail: (n: number) => {
      failAt = n;
    },
  };
}

test("0.5% of profit, partial cost basis, fractional cents, and legacy eligibility", () => {
  const p = { amount: 120000, invested: 100000, shareEligible: true };
  const first = settleProfitShare(p, 60000);
  assert.equal(first.realizedProfit, 10000);
  assert.equal(first.fee, 50);
  assert.equal(first.netProceeds, 59950);
  const second = settleProfitShare(
    {
      ...p,
      ...first,
      amount: first.remainingAmount,
      invested: first.remainingCost,
    },
    60000,
  );
  assert.equal(second.fee, 50);
  assert.equal(second.sharePaid, 100);
  assert.equal(
    settleProfitShare({ ...p, shareEligible: false }, 120000).fee,
    0,
  );
  const fractional = settleProfitShare(
    { amount: 10199, invested: 10000, shareEligible: true },
    10199,
  );
  assert.equal(fractional.fee, 0);
  assert.equal(
    settleProfitShare(
      { amount: 10001, invested: 10000, shareEligible: true, ...fractional },
      10001,
    ).fee,
    1,
  );
  assert.throws(() => settleProfitShare({ amount: 0, invested: 0 }, 0));
});
test("server attributes community takes to their owner, excluding self and examples", () => {
  assert.equal(hasCreatorShare(thesis, "follower"), true);
  assert.equal(hasCreatorShare(thesis, "creator"), false);
  assert.equal(
    hasCreatorShare({ ...thesis, example: true }, "follower"),
    false,
  );
});
test("all investors pay the selected fee independently of free follow and unfollow", async () => {
  const f=fixture();
  await f.trade('buy',100000,{acceptProfitShare:false});
  assert.equal(f.get('positions').share_creator,'creator');
  assert.equal(f.get('thesis_follows'),undefined);
  await followTake(f.db,'follower',thesis,true,false);
  await followTake(f.db,'follower',thesis,false,false);
  assert.equal(f.get('thesis_follows').active,0);
  await f.trade('simulate',1,{change:20});
  assert.equal((await f.trade('sell',119940)).creatorFee,299);
});
test("profitable sale transfers only the fee, reconciles accounts and replays once", async () => {
  const f = fixture();
  await f.trade("buy", 100000);
  await f.trade("simulate", 1, { change: 20 });
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) n FROM creator_earnings").get()!.n,
    0,
  );
  const id = crypto.randomUUID();
  const sale = await f.trade("sell", 119940, { id });
  assert.equal(sale.creatorFee, 299);
  assert.equal(sale.tradingFee, 0);
  assert.equal(sale.platformProfitFee, 99);
  assert.equal(f.get("accounts").balance, 1019542);
  assert.equal(f.get("accounts", "creator").balance, 1000299);
  assert.equal(f.get("positions").amount, 0);
  assert.equal((await f.trade("sell", 119940, { id })).creatorFee, 299);
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) n FROM creator_earnings").get()!.n,
    1,
  );
  await assert.rejects(f.trade("sell", 100000, { id }), /already used/);
  await assert.rejects(
    f.trade("sell", 119940, { id, user: "creator" }),
    /already used/,
  );
});
test("loss carryforward and high-water mark survive closing, unfollowing and re-entry", async () => {
  const f = fixture();
  async function round(change: number) {
    await f.trade("buy", 100000);
    await f.trade("simulate", 1, { change });
    return f.trade("sell", Number(f.get("positions").amount));
  }
  assert.equal((await round(-20)).creatorFee, 0);
  await followTake(f.db, "follower", thesis, false, false);
  assert.equal((await round(10)).creatorFee, 0);
  assert.equal((await round(30)).creatorFee, 297);
  assert.equal((await round(-10)).creatorFee, 0);
  assert.equal((await round(20)).creatorFee, 149);
  assert.equal((await round(10)).creatorFee, 149);
  assert.equal(f.get("positions").share_paid, 595);
});
test("legacy positions retain their exemption until closed; a new creator entry adopts sharing", async () => {
  const f = fixture();
  f.sqlite
    .prepare(
      "INSERT INTO positions(id,user_id,thesis_id,amount,invested) VALUES ('old','follower','community',100000,100000)",
    )
    .run();
  f.sqlite
    .prepare("UPDATE accounts SET balance=900000 WHERE user_id='follower'")
    .run();
  await assert.rejects(f.trade("buy",100000),/Close/);
  await f.trade("simulate", 1, { change: 10 });
  assert.equal((await f.trade("sell", 110000)).creatorFee, 0);
  await f.trade("buy", 100000);
  await f.trade("simulate", 1, { change: 10 });
  assert.equal((await f.trade("sell", 109945)).creatorFee, 149);
});
test("take-profit exits share profit; stop-loss charges no profit share, and own takes have no creator share", async () => {
  const f = fixture();
  await f.trade("buy", 100000);
  f.sqlite.prepare("UPDATE positions SET execution_state=NULL,take_profit=10,stop_loss=10").run();
  const exit = await f.trade("simulate", 1, { change: 20 });
  assert.equal(exit.triggered, true);
  assert.equal(exit.creatorFee, 299);
  assert.equal(exit.tradingFee, 0);
  assert.equal(f.get("positions").amount, 0);
  await f.trade("buy", 100000);
  assert.equal((await f.trade("simulate", 1, { change: -10 })).creatorFee, 0);
  await f.trade("buy", 100000, { user: "creator", acceptProfitShare: false });
  await f.trade("simulate", 1, { user: "creator", change: 20 });
  assert.equal(
    (await f.trade("sell", 119940, { user: "creator" })).creatorFee,
    0,
  );
});
test("concurrent buys cannot overwrite holdings or double-spend; same request is idempotent", async () => {
  const f = fixture();
  const results = await Promise.allSettled([
    f.trade("buy", 100000),
    f.trade("buy", 100000),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(f.get("positions").amount, 99950);
  assert.equal(f.get("accounts").balance, 900000);
  const id = crypto.randomUUID();
  await Promise.all([
    f.trade("buy", 100000, { id }),
    f.trade("buy", 100000, { id }),
  ]);
  assert.equal(f.get("positions").amount, 199900);
  assert.equal(f.get("accounts").balance, 800000);
});
test("an interrupted payout rolls back sale, position, fee and both accounts", async () => {
  const f = fixture();
  await f.trade("buy", 100000);
  await f.trade("simulate", 1, { change: 20 });
  f.fail(6);
  await assert.rejects(f.trade("sell", 119940), /Injected/);
  assert.equal(f.get("positions").amount, 119940);
  assert.equal(f.get("accounts").balance, 900000);
  assert.equal(f.get("accounts", "creator").balance, 1000000);
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) n FROM creator_earnings").get()!.n,
    0,
  );
  assert.equal(
    f.sqlite.prepare("SELECT COUNT(*) n FROM orders WHERE side='sell'").get()!
      .n,
    0,
  );
});
test("investment performance is net of fees, creator credits are cash but not investment gains", () => {
  const now = Date.parse("2026-09-29T18:00:00Z");
  const orders = [
    { id: "1", thesisId: "a", side: "buy", amount: 100000, createdAt: now - 4 },
    {
      id: "2",
      thesisId: "a",
      side: "rule-exit",
      amount: 120000,
      creatorFee: 100,
      createdAt: now - 3,
    },
    {
      id: "3",
      thesisId: "b",
      side: "creator-income",
      amount: 500,
      createdAt: now - 2,
    },
  ];
  const profile = paperPerformance(orders, [], 1020400, now);
  assert.equal(profile.equity, 10204);
  assert.equal(profile.creatorIncome, 5);
  assert.equal(profile.creatorFees, 1);
  assert.equal(profile.performance.profit, 199);
  assert.equal(profile.performance.realized, 199);
  assert.equal(profile.performance.rows.length, 1);
  assert.equal(profile.performance.points.at(-1)!.value, 10199);
  const rankings = paperRankings(
    [
      {
        userId: "f",
        balance: 1020400,
        enrolled: true,
        creator: {
          id: "f",
          name: "Follower",
          handle: "f",
          twitterUrl: null,
          avatarUrl: null,
          bio: "",
        },
      },
    ],
    orders.map((o) => ({ ...o, userId: "f" })),
    [],
    "week",
    now,
  );
  assert.equal(rankings.excluded, 0);
  assert.equal(rankings.investors[0].returnPct, 1.99);
  assert.equal(rankings.takes[0].returnPct, 19.9);
});

test("max spend and a flat round trip charge only the entry fee without overdrawing", async () => {
  const f = fixture();
  const id = crypto.randomUUID();
  const buy = await f.trade("buy", 1000000, { id });
  assert.equal(buy.tradingFee, 500);
  assert.equal(f.get("accounts").balance, 0);
  assert.equal(f.get("positions").amount, 999500);
  assert.equal(f.get("positions").invested, 1000000);
  assert.equal((await f.trade("buy", 1000000, { id })).tradingFee, 500);
  await assert.rejects(f.trade("buy", 1), /Not enough/);
  const sale = await f.trade("sell", 999500);
  assert.equal(sale.tradingFee, 0);
  assert.equal(sale.creatorFee, 0);
  assert.equal(f.get("accounts").balance, 999500);
  assert.equal(
    f.sqlite.prepare("SELECT sum(trading_fee) total FROM orders").get()!.total,
    500,
  );
});

test("partial sales reconcile fees, cost basis, creator share, profile, and ranking", async () => {
  const f = fixture();
  await f.trade("buy", 100000);
  const move = await f.trade("simulate", 1, { change: 20 });
  assert.equal(move.tradingFee, 0);
  const first = await f.trade("sell", 59970);
  assert.equal(first.tradingFee, 0);
  assert.equal(first.creatorFee, 149);
  assert.equal(f.get("positions").amount, 59970);
  assert.equal(f.get("positions").invested, 50000);
  await f.trade("sell", 59970);
  assert.equal(f.get("accounts").balance, 1019542);
  const orders = f.sqlite
    .prepare(
      "SELECT id,thesis_id AS thesisId,side,amount,creator_fee AS creatorFee,trading_fee AS tradingFee,platform_profit_fee AS platformProfitFee,created_at AS createdAt FROM orders WHERE user_id='follower' ORDER BY created_at,rowid",
    )
    .all() as PaperOrder[];
  const now = Date.now();
  const p = paperPerformance(orders, [], 1019542, now);
  assert.equal(p.tradingFees, 0.5);
  assert.equal(p.creatorFees, 2.99);
  assert.equal(p.platformProfitFees, 0.99);
  assert.equal(p.performance.profit, 195.42);
  assert.equal(p.performance.rows[0].realized, 195.42);
  assert.deepEqual(
    p.performance.points.map((x) => x.value),
    [10000, 9999.5, 10199.4, 10197.42, 10195.42, 10195.42],
  );
  const rankings = paperRankings(
    [
      {
        userId: "follower",
        balance: 1019542,
        enrolled: true,
        creator: {
          id: "follower",
          name: "Follower",
          handle: "f",
          twitterUrl: null,
          avatarUrl: null,
          bio: "",
        },
      },
    ],
    orders.map((o) => ({ ...o, userId: "follower" })),
    [],
    "week",
    now,
  );
  assert.equal(rankings.excluded, 0);
  assert.equal(rankings.takes[0].returnPct, 19.542);
  assert.equal(rankings.investors[0].returnPct, 1.9542);
});

test("a losing automatic exit charges no exit fee or profit share", async () => {
  const f = fixture();
  await f.trade("buy", 100000);
  f.sqlite.prepare("UPDATE positions SET execution_state=NULL,stop_loss=10").run();
  const exit = await f.trade("simulate", 1, { change: -10 });
  assert.equal(exit.triggered, true);
  assert.equal(exit.tradingFee, 0);
  assert.equal(exit.creatorFee, 0);
  assert.equal(f.get("accounts").balance, 989955);
});


test('selected rates preserve quarter basis points, cap platform share, and reject invalid fees',()=>{
  for(const [bps,creatorUnits,platformUnits] of [[0,0,0],[1,3,1],[100,300,100],[200,600,200],[1000,3000,1000],[2000,7000,1000]])assert.deepEqual(feeRates(bps),{creatorUnits,platformUnits});
  assert.equal(feePercent(1),'0.0025%');
  for(const bps of [-1,2001,1.2,NaN,Infinity])assert.throws(()=>selectedFeeBps({performanceFeeBps:bps}),/0% to 20%/);
  assert.throws(()=>readFeeTerms('{"version":2}'),/invalid/);
});

test('20% total includes 17.5% creator and 2.5% platform; zero fee pays neither',async()=>{
  for(const [bps,creatorFee,platformProfitFee] of [[2000,3489,498],[200,299,99],[0,0,0]]){
    const f=fixture(),take={...thesis,performanceFeeBps:bps};
    await f.trade('buy',100000,{take,acceptProfitShare:false});
    await f.trade('simulate',1,{take,change:20});
    const sale=await f.trade('sell',119940,{take});
    assert.equal(sale.creatorFee,creatorFee);assert.equal(sale.platformProfitFee,platformProfitFee);
    assert.equal(f.get('accounts').balance,1019940-creatorFee-platformProfitFee);
    assert.equal(f.get('accounts','creator').balance,1000000+creatorFee);
    const ledger=f.sqlite.prepare("SELECT fee_policy,fee_terms FROM orders WHERE side='sell'").get()!;
    assert.equal(ledger.fee_policy,'v3');assert.deepEqual(JSON.parse(String(ledger.fee_terms)),JSON.parse(String(f.get('positions').fee_terms)));
  }
});

test('self investment pays only the platform portion and curated examples pay no creator',async()=>{
  for(const self of [true,false]){
    const f=fixture(),take={...thesis,performanceFeeBps:2000,example:!self},user=self?'creator':'follower';
    await f.trade('buy',100000,{take,user});await f.trade('simulate',1,{take,user,change:20});
    const sale=await f.trade('sell',119940,{take,user});
    assert.equal(sale.creatorFee,0);assert.equal(sale.platformProfitFee,498);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM creator_earnings').get()!.n,0);
  }
});

test('fee snapshot cannot be changed by creator edits or mixed with new terms',async()=>{
  const f=fixture(),take={...thesis,performanceFeeBps:1000},changed={...take,performanceFeeBps:2000};
  await f.trade('buy',100000,{take});
  const terms=f.get('positions').fee_terms;
  await assert.rejects(f.trade('buy',10000,{take:changed}),/Close/);
  await f.trade('simulate',1,{take:changed,change:20});
  const first=await f.trade('sell',59970,{take:changed}),second=await f.trade('sell',59970,{take:changed});
  assert.equal(first.creatorFee,747);assert.equal(second.creatorFee,748);
  assert.equal(first.platformProfitFee+second.platformProfitFee,498);
  assert.equal(f.get('positions').fee_terms,terms);
  assert.equal(f.get('accounts').balance,1017947);
});

test('legacy held positions keep their original 0.5% plus 3% until closed',async()=>{
  const f=fixture();
  f.sqlite.prepare("INSERT INTO positions(id,user_id,thesis_id,amount,invested,share_eligible,share_creator) VALUES ('legacy','follower','community',120000,100000,1,'creator')").run();
  const sale=await f.trade('sell',120000,{take:{...thesis,performanceFeeBps:2000}});
  assert.equal(sale.creatorFee,100);assert.equal(sale.platformProfitFee,600);
  assert.equal(f.sqlite.prepare("SELECT fee_policy FROM orders WHERE side='sell'").get()!.fee_policy,'v2');
});

test('re-entry with changed fees recovers losses and never reprices old profits',async()=>{
  const f=fixture(),original={...thesis,performanceFeeBps:200},changed={...thesis,performanceFeeBps:2000};
  async function round(take:Thesis,change:number){await f.trade('buy',100000,{take});await f.trade('simulate',1,{take,change});return f.trade('sell',Number(f.get('positions').amount),{take});}
  const initial=await round(original,20);assert.equal(initial.creatorFee,299);
  assert.equal((await round(original,-20)).creatorFee,0);
  assert.equal((await round(changed,10)).creatorFee,0);
  const recovered=await round(changed,30);
  // New epoch starts at $199.40 old high water. Only $198.40 above it is newly eligible.
  assert.equal(recovered.creatorFee,3472);assert.equal(recovered.platformProfitFee,496);
  assert.equal(f.get('positions').share_paid,3771);
});

test('one-cent partial profit carry survives re-entry without exceeding the selected total',()=>{
  let p={amount:101,invested:100,feeTerms:JSON.stringify(startFeeTerms({...thesis,performanceFeeBps:1101},'follower')),platformRealized:0,platformHighWater:0,platformPaid:0,sharePaid:0};
  for(let n=1;n<=200;n++){
    assert.equal(JSON.stringify(startFeeTerms({...thesis,performanceFeeBps:1101},'follower',p)),p.feeTerms);
    const sale=settlePositionFees(p,101);
    assert.ok(sale.fee+sale.platformProfitFee>=0);
    assert.ok(sale.sharePaid+sale.platformPaid<=Math.floor(n*0.1101));
    p={...p,...sale,amount:101,invested:100};
  }
  assert.equal(p.sharePaid,17);assert.equal(p.platformPaid,5);
});

test('new rates preserve legacy-exempt losses and zero-fee high water without retroactive charges',()=>{
  const take={...thesis,performanceFeeBps:2000};
  const legacy={amount:12000,invested:10000,platformRealized:-3000,platformHighWater:0,platformPaid:0,sharePaid:0,shareRealized:0};
  const feeTerms=JSON.stringify(startFeeTerms(take,'follower',legacy));
  const first=settlePositionFees({...legacy,feeTerms},12000);
  assert.equal(first.fee,0);assert.equal(first.platformProfitFee,0);
  const second=settlePositionFees({...legacy,...first,feeTerms,amount:12000,invested:10000},12000);
  assert.equal(second.fee,175);assert.equal(second.platformProfitFee,25);
  const zeroTerms=JSON.stringify(startFeeTerms({...thesis,performanceFeeBps:0},'follower'));
  const zeroProfit=settlePositionFees({amount:12000,invested:10000,feeTerms:zeroTerms},12000);
  const prior={...zeroProfit,amount:12000,invested:10000,feeTerms:zeroTerms};
  const newTerms=JSON.stringify(startFeeTerms(take,'follower',prior));
  const next=settlePositionFees({...prior,feeTerms:newTerms},12000);
  assert.equal(next.fee,350);assert.equal(next.platformProfitFee,50);
  const zeroLoss=settlePositionFees({amount:8000,invested:10000,feeTerms:zeroTerms},8000);
  const loss={...zeroLoss,amount:12000,invested:10000,feeTerms:zeroTerms};
  assert.equal(settlePositionFees({...loss,feeTerms:JSON.stringify(startFeeTerms(take,'follower',loss))},12000).fee,0);
});

test('a changed published fee racing a buy cannot spend or create holdings',async()=>{
  const f=fixture(),changed={...thesis,performanceFeeBps:2000,version:thesis.version+1};
  f.sqlite.prepare('INSERT INTO theses(id,owner,payload,created_at) VALUES(?,?,?,?)').run(thesis.id,'creator',JSON.stringify(changed),1);
  await assert.rejects(f.trade('buy',100000),/Refresh/);
  assert.equal(f.get('accounts').balance,1000000);assert.equal(f.get('positions'),undefined);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM orders').get()!.n,0);
});

test('automatic partial exits use saved performance terms despite a creator fee edit',async()=>{
  const f=fixture(),take:Thesis={...thesis,performanceFeeBps:1000,allocations:[{symbol:'BTC',weight:100}],exitPlan:{id:'fee-exit',mode:'basket',steps:[{symbol:null,targetPct:10,sellPct:50},{symbol:null,targetPct:50,sellPct:50}],rationale:'Scale out.',origin:'creator',updatedAt:1}};
  await f.trade('buy',100000,{take});
  const sale=await f.trade('simulate',1,{take:{...take,performanceFeeBps:2000},change:20});
  assert.equal(sale.executionReason,'creator-exit');assert.equal(sale.creatorFee,747);assert.equal(sale.platformProfitFee,249);
  assert.equal(f.get('positions').invested,50000);assert.equal(f.get('positions').amount,59970);
});

test('fee migration leaves existing private takes and legacy investment promises untouched',()=>{
  const sqlite=new DatabaseSync(':memory:');
  const migrations=readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort();
  for(const file of migrations.filter(n=>!n.startsWith('0019')))sqlite.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
  sqlite.prepare("INSERT INTO theses(id,owner,payload,created_at,visibility) VALUES('private-call','creator','{}',1,'private')").run();
  sqlite.prepare("INSERT INTO positions(id,user_id,thesis_id,amount,invested) VALUES('old','follower','private-call',10000,10000)").run();
  sqlite.exec(readFileSync(new URL('../drizzle/0019_funny_bromley.sql',import.meta.url),'utf8'));
  assert.equal(sqlite.prepare('SELECT visibility FROM theses').get()!.visibility,'private');
  assert.equal(sqlite.prepare('SELECT fee_terms FROM positions').get()!.fee_terms,null);
  assert.equal(sqlite.prepare('SELECT amount FROM positions').get()!.amount,10000);sqlite.close();
});
