import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {fundDemoWallet,DEMO_BALANCE_LIMIT} from "../lib/demo-wallet";
import {paperPerformance,type PaperOrder} from "../lib/performance";
import {paperRankings} from "../lib/leaderboard";
function fixture(){
  const sql=new DatabaseSync(":memory:");
  for(const name of readdirSync(new URL("../drizzle/",import.meta.url)).filter(n=>n.endsWith(".sql")).sort())sql.exec(readFileSync(new URL(`../drizzle/${name}`,import.meta.url),"utf8"));
  sql.prepare("INSERT INTO accounts(user_id,demo_wallet_connected) VALUES ('u',1)").run();
  let fail=false;
  class Statement{values:any[]=[];constructor(public query:string){}bind(...v:any[]){this.values=v;return this;}async first(){return sql.prepare(this.query).get(...this.values)||null;}async run(){return {meta:sql.prepare(this.query).run(...this.values)};}}
  const db={prepare:(q:string)=>new Statement(q),async batch(statements:Statement[]){sql.exec("BEGIN");try{const r=statements.map((s,i)=>{if(fail&&i===1)throw new Error("Interrupted deposit");return {meta:sql.prepare(s.query).run(...s.values)};});sql.exec("COMMIT");return r;}catch(e){sql.exec("ROLLBACK");throw e;}}} as unknown as D1Database;
  return {sql,db,fail:()=>{fail=true;},balance:()=>sql.prepare("SELECT balance FROM accounts WHERE user_id='u'").get()!.balance};
}
test("demo deposits update the trade balance once and preserve the funding network",async()=>{
  const f=fixture(),id=crypto.randomUUID();
  await fundDemoWallet(f.db,"u",id,125050,"Solana");
  await fundDemoWallet(f.db,"u",id,125050,"Solana");
  assert.equal(f.balance(),1125050);
  assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM orders").get()!.n,1);
  assert.equal(f.sql.prepare("SELECT execution_reason FROM orders").get()!.execution_reason,"network:Solana");
  await assert.rejects(fundDemoWallet(f.db,"u",id,10000,"Base"),/already been used/);
});
test("disconnected, invalid and oversized deposits cannot credit funds",async()=>{
  const f=fixture();
  f.sql.prepare("UPDATE accounts SET demo_wallet_connected=0").run();
  await assert.rejects(fundDemoWallet(f.db,"u",crypto.randomUUID(),100,"Base"),/Connect/);
  for(const amount of [0,-1,1.2,99,100000001])await assert.rejects(fundDemoWallet(f.db,"u",crypto.randomUUID(),amount,"Base"));
  await assert.rejects(fundDemoWallet(f.db,"u",crypto.randomUUID(),100,"<script>"));
  f.sql.prepare("UPDATE accounts SET demo_wallet_connected=1,balance=?").run(DEMO_BALANCE_LIMIT);
  await assert.rejects(fundDemoWallet(f.db,"u",crypto.randomUUID(),100,"Base"),/limit/);
  assert.equal(f.balance(),DEMO_BALANCE_LIMIT);
});
test("failed deposit batches roll back the balance and activity together",async()=>{
  const f=fixture();f.fail();
  await assert.rejects(fundDemoWallet(f.db,"u",crypto.randomUUID(),10000,"Ethereum"),/Interrupted/);
  assert.equal(f.balance(),1000000);assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM orders").get()!.n,0);
});
test("funding is excluded from investment profit and investor leaderboard returns",()=>{
  const now=1800000000000;
  const orders:PaperOrder[]=[{id:"1",thesisId:"a",side:"buy",amount:100000,createdAt:now-10000},{id:"2",thesisId:"a",side:"scenario",amount:110000,createdAt:now-9000},{id:"3",thesisId:"",side:"demo-fund",amount:500000,createdAt:now-8000}];
  const positions=[{id:"p",thesisId:"a",amount:110000,invested:100000,takeProfit:null,stopLoss:null}];
  const p=paperPerformance(orders,positions,1400000,now);
  assert.equal(p.performance.profit,100);assert.equal(p.funded,15000);assert.equal(p.equity,15100);assert.equal(p.performance.trades,1);assert.equal(p.performance.rows.length,1);assert.equal(p.performance.points.at(-1)!.value,10100);
  const creator={id:"c",name:"u",handle:"u",twitterUrl:"https://x.com/u",avatarUrl:null,bio:""};
  const ranked=paperRankings([{userId:"u",balance:1400000,creator,enrolled:true}],orders.map(o=>({...o,userId:"u"})),[{userId:"u",thesisId:"a",amount:110000}],"month",now);
  assert.equal(ranked.excluded,0);assert.equal(ranked.investors[0].returnPct,1);assert.equal(ranked.takes[0].returnPct,10);
});
