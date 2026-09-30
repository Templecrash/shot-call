import {creatorConfigKey} from '../lib/creator-execution';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {paperTrade,followTake} from '../lib/paper-trading';
import {manageTake} from '../lib/take-lifecycle';
import {readThesis} from '../lib/thesis-store';
import {EXAMPLES,type Thesis} from '../lib/data';
const thesis:Thesis={...EXAMPLES.find(t=>t.id==='majors-bottom')!,id:'community',owner:'creator',example:false,exitPlan:undefined};
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

function stored(f:ReturnType<typeof fixture>) {f.sqlite.prepare("INSERT INTO theses(id,owner,payload,created_at,visibility) VALUES (?,?,?,?,'public')").run(thesis.id,'creator',JSON.stringify(thesis),Date.now());}
test('only the owner can remove; removal and restore preserve history and a closed state',async()=>{
 const f=fixture();stored(f);
 f.sqlite.prepare("INSERT INTO orders(id,user_id,thesis_id,side,amount,created_at) VALUES ('past','follower','community','scenario',100,1)").run();
 await assert.rejects(manageTake(f.db,'follower',thesis.id,'archive'),/Only the creator/);
 await manageTake(f.db,'creator',thesis.id,'archive');
 let saved=(await readThesis(f.db,thesis.id,'creator'))!;assert.ok(saved.archivedAt);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM orders").get()!.n,1);
 await assert.rejects(f.trade('buy',10000,{take:saved}),/closed/);
 await manageTake(f.db,'creator',thesis.id,'restore');saved=(await readThesis(f.db,thesis.id,'creator'))!;assert.equal(saved.archivedAt,undefined);
 await manageTake(f.db,'creator',thesis.id,'close');await manageTake(f.db,'creator',thesis.id,'archive');await manageTake(f.db,'creator',thesis.id,'restore');
 saved=(await readThesis(f.db,thesis.id,'creator'))!;assert.ok(saved.closedAt);assert.equal(saved.archivedAt,undefined);
});
test('creator selling does not sell a follower; closing blocks new capital but preserves individual exits',async()=>{
 const f=fixture();stored(f);
 await f.trade('buy',10000,{user:'creator'});await f.trade('buy',10000,{id:'before-close'});
 await f.trade('sell',9995,{user:'creator'});
 assert.equal(f.get('positions').amount,9995);assert.equal(f.get('accounts').balance,990000);
 await assert.rejects(manageTake(f.db,'creator',thesis.id,'archive'),/open investments/);
 await manageTake(f.db,'creator',thesis.id,'close');const closed=(await readThesis(f.db,thesis.id,'follower'))!;
 const replay=await f.trade('buy',10000,{id:'before-close',take:closed});assert.equal(replay.tradingFee,5);
 await assert.rejects(f.trade('buy',10000,{take:closed}),/closed/);
 // A request that loaded the old live payload also loses at the atomic SQL guard.
 await assert.rejects(f.trade('buy',10000,{take:thesis}),/portfolio changed/);
 assert.equal(f.get('accounts').balance,990000);assert.equal(f.get('positions').amount,9995);
 await assert.rejects(followTake(f.db,'follower',closed,true,true),/closed/);
 await f.trade('sell',9995,{take:closed});assert.equal(f.get('accounts').balance,999995);
 assert.equal(f.get('positions').amount,0);await manageTake(f.db,'creator',thesis.id,'archive');
});
test('platform profit share uses the new default 0.5% after entry cost, recovers losses, and carries fractional cents across reentry',async()=>{
 const f=fixture();
 async function round(change:number) {await f.trade('buy',100000);await f.trade('simulate',1,{change});return f.trade('sell',Number(f.get('positions').amount));}
 const loss=await round(-20);assert.equal(loss.platformProfitFee,0);assert.equal(loss.tradingFee,0);
 assert.equal((await round(10)).platformProfitFee,0);
 assert.equal((await round(30)).platformProfitFee,99); // Cumulative recovered profit $198.40, 0.5% rounds down with remainder retained.
 assert.equal((await round(-10)).platformProfitFee,0);
 assert.equal((await round(20)).platformProfitFee,49);
 assert.equal((await round(10)).platformProfitFee,50);
 assert.equal(f.get('positions').platform_paid,198);
 assert.equal(f.get('positions').platform_realized,39679);
 assert.equal(f.get('accounts','creator').balance,1000595);
});
