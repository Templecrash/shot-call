import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { readThesisInvestments } from "../lib/thesis-investments";

function fixture() {
  const sql = new DatabaseSync(":memory:");
  for (const file of readdirSync(new URL("../drizzle/", import.meta.url))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    sql.exec(
      readFileSync(new URL("../drizzle/" + file, import.meta.url), "utf8"),
    );
  class Statement {
    values: string[] = [];
    constructor(public text: string) {}
    bind(...values: string[]) {
      this.values = values;
      return this;
    }
  }
  const db = {
    prepare: (text: string) => new Statement(text),
    batch: async (statements: Statement[]) =>
      statements.map((s) => ({
        success: true,
        results: sql.prepare(s.text).all(...s.values),
      })),
  } as unknown as D1Database;
  const position = (user: string, thesis: string, amount: number) =>
    sql
      .prepare(
        "INSERT INTO positions(id,user_id,thesis_id,amount,invested) VALUES(?,?,?,?,?) ON CONFLICT(user_id,thesis_id) DO UPDATE SET amount=excluded.amount",
      )
      .run(user + ":" + thesis, user, thesis, amount, 999999);
  const profile = (user: string, enrolled: number) =>
    sql
      .prepare(
        "INSERT INTO creator_profiles(id,user_id,name,twitter_handle,avatar_key,leaderboard_opt_in,updated_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(
        "profile-" + user,
        user,
        "Investor " + user,
        "investor_" + user,
        "private-storage-" + user,
        enrolled,
        123,
      );
  return { sql, db, position, profile };
}

test("active investors and current AUM track adds, partial sales, exits and isolated thesis IDs", async () => {
  const f = fixture();
  f.position("a", "take", 98000);
  f.position("b", "take", 49000);
  f.position("c", "take", 0);
  f.position("a", "fork", 30000);
  f.position("d", "unrequested", 50000);
  let totals = await readThesisInvestments(f.db, [
    "take",
    "fork",
    "empty",
    "take",
  ]);
  assert.deepEqual(totals.take, { investors: 2, aum: 147000, profiles: [] });
  assert.equal(totals.fork.investors, 1);
  assert.equal(totals.fork.aum, 30000);
  assert.deepEqual(totals.empty, { investors: 0, aum: 0, profiles: [] });
  assert.equal(totals.unrequested, undefined);
  f.position("a", "take", 150000);
  totals = await readThesisInvestments(f.db, ["take"]);
  assert.equal(totals.take.investors, 2);
  assert.equal(totals.take.aum, 199000);
  f.position("b", "take", 20000);
  assert.equal((await readThesisInvestments(f.db, ["take"])).take.aum, 170000);
  f.position("b", "take", 0);
  assert.equal((await readThesisInvestments(f.db, ["take"])).take.investors, 1);
  f.position("a", "take", 165000);
  assert.equal((await readThesisInvestments(f.db, ["take"])).take.aum, 165000);
});

test("avatar samples respect public performance opt-in, reveal no balances, and count anonymous investors", async () => {
  const f = fixture();
  for (const user of ["a", "b", "c", "d", "e", "f"]) {
    f.position(user, "take", 10000);
    f.profile(user, 1);
  }
  f.position("private", "take", 25000);
  f.profile("private", 0);
  f.position("no-profile", "take", 35000);
  f.position("exited", "take", 0);
  f.profile("exited", 1);
  f.sql
    .prepare("INSERT INTO accounts(user_id,balance) VALUES(?,?)")
    .run("cash-only", 5000000);
  f.sql
    .prepare(
      "INSERT INTO thesis_follows(user_id,thesis_id,creator_id,accepted_at) VALUES(?,?,?,?)",
    )
    .run("follower-only", "take", "creator", 1);
  f.sql
    .prepare(
      "INSERT INTO prediction_rounds(id,thesis_id,days,sequence,thesis_version,title,basket,starts_at,ends_at) VALUES('round','take',1,1,1,'Take','[]',1,2)",
    )
    .run();
  // This fixture represents history recorded before sentiment retirement.
  f.sql.exec('DROP TRIGGER reject_retired_prediction_bets');
  f.sql
    .prepare(
      "INSERT INTO prediction_bets(id,round_id,user_id,side,amount,stake,fee,request_key,operation_id,created_at) VALUES('bet','round','bettor-only','right',10000,9800,200,'key','operation',1)",
    )
    .run();
  const totals = await readThesisInvestments(f.db, ["take"]);
  assert.equal(totals.take.investors, 8);
  assert.equal(totals.take.aum, 120000);
  assert.deepEqual(
    totals.take.profiles.map((p) => p.id),
    ["profile-a", "profile-b", "profile-c"],
  );
  assert.equal(
    totals.take.profiles[0].avatarUrl,
    "/api/creators/profile-a/avatar?v=123",
  );
  const response = JSON.stringify(totals);
  assert.ok(!response.includes("private-storage"));
  assert.ok(!response.includes("user_id"));
  assert.ok(!response.includes("invested"));
  assert.ok(!response.includes("investor_private"));
});

test('featured photos use the three largest visible active positions and update after sales',async()=>{
  const f=fixture();
  for(const [user,amount] of [['a',10000],['b',30000],['c',20000],['d',40000],['e',40000]] as const){
    f.position(user,'take',amount);f.profile(user,1);
  }
  f.position('private','take',90000);f.profile('private',0);
  f.position('no-photo','take',80000);f.profile('no-photo',1);
  f.sql.prepare('UPDATE creator_profiles SET avatar_key=NULL WHERE user_id=?').run('no-photo');
  f.position('no-profile','take',70000);
  f.position('exited','take',0);f.profile('exited',1);
  f.position('a','other-take',90000);
  const ids=(investment:{profiles:{id:string}[]})=>investment.profiles.map(profile=>profile.id);
  let totals=await readThesisInvestments(f.db,['take','other-take']);
  assert.deepEqual(ids(totals.take),['profile-d','profile-e','profile-b']);
  assert.equal(totals.take.investors,8);
  assert.equal(totals.take.aum,380000);
  assert.deepEqual(ids(totals['other-take']),['profile-a']);
  assert.ok(!JSON.stringify(totals.take.profiles).includes('amount'));
  f.position('d','take',5000);
  f.position('e','take',0);
  totals=await readThesisInvestments(f.db,['take']);
  assert.deepEqual(ids(totals.take),['profile-b','profile-c','profile-a']);
  assert.equal(totals.take.investors,7);
});

test("large feeds stay within D1 binding limits and storage errors never become zero totals", async () => {
  const f = fixture();
  const ids = Array.from({ length: 205 }, (_, i) => "take-" + i);
  ids.forEach((id) => f.position("a", id, 100));
  const totals = await readThesisInvestments(f.db, ids);
  assert.equal(Object.keys(totals).length, 205);
  assert.equal(totals["take-204"].aum, 100);
  assert.deepEqual(await readThesisInvestments(f.db, []), {});
  const broken = {
    prepare: f.db.prepare,
    batch: async () => {
      throw new Error("Unavailable");
    },
  } as unknown as D1Database;
  await assert.rejects(readThesisInvestments(broken, ["take"]), /Unavailable/);
});
