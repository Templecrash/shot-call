import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {ProfileError,saveCreatorProfile} from '../lib/profile-store';
import {publicInvestments,profileFollowCounts} from '../lib/public-profile';
import {EXAMPLES} from '../lib/data';
import {creatorStats} from '../lib/creator-stats';
import type {Creator} from '../lib/creators';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
  let fail=false;
  class Statement{
    values:(string|number|null)[]=[];
    constructor(public sql:string){}
    bind(...values:(string|number|null)[]){this.values=values;return this;}
    async first(){return sqlite.prepare(this.sql).get(...this.values)||null;}
    async all(){return {results:sqlite.prepare(this.sql).all(...this.values),success:true};}
    async run(){if(fail)throw new Error('Injected database failure');return {meta:sqlite.prepare(this.sql).run(...this.values),success:true};}
  }
  const files=new Map<string,{bytes:Uint8Array;mime:string}>();
  const db={prepare:(sql:string)=>new Statement(sql)} as unknown as D1Database;
  const bucket={async put(key:string,bytes:Uint8Array,options:{httpMetadata:{contentType:string}}){files.set(key,{bytes,mime:options.httpMetadata.contentType});},async delete(key:string){files.delete(key);}} as unknown as R2Bucket;
  return {sqlite,db,bucket,files,fail:()=>{fail=true;}};
}
function data(){const form=new FormData();form.set('name','Alice');form.set('twitterUrl','@alice');form.set('bio','Ideas');return form;}
function image(){return new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'image.png',{type:'image/png'});}

test('picture, banner and investment visibility persist together and update only the signed-in owner',async()=>{
  const f=fixture();await saveCreatorProfile(f.db,f.bucket,'bob',data());
  const form=data();form.set('photo',image());form.set('banner',image());form.set('publicInvestments','true');
  const creator=await saveCreatorProfile(f.db,f.bucket,'alice',form);
  assert.match(creator.avatarUrl!,/^\/api\/creators\/.+\/avatar\?v=\d+$/);
  assert.match(creator.bannerUrl!,/^\/api\/creators\/.+\/banner\?v=\d+$/);
  assert.equal(creator.publicInvestments,true);assert.equal(creator.twitterUrl,'https://x.com/alice');
  assert.equal(f.files.size,2);assert.ok([...f.files.values()].every(file=>file.mime==='image/png'));
  assert.equal(f.sqlite.prepare("SELECT banner_key FROM creator_profiles WHERE user_id='bob'").get()!.banner_key,null);
  const oldAvatar=f.sqlite.prepare("SELECT avatar_key FROM creator_profiles WHERE user_id='alice'").get()!.avatar_key;
  const change=data();change.set('removeBanner','true');change.set('publicInvestments','false');
  const updated=await saveCreatorProfile(f.db,f.bucket,'alice',change);
  assert.equal(updated.id,creator.id);assert.equal(updated.bannerUrl,null);assert.equal(updated.publicInvestments,false);
  assert.equal(f.sqlite.prepare("SELECT avatar_key FROM creator_profiles WHERE user_id='alice'").get()!.avatar_key,oldAvatar);
  assert.equal(f.files.size,1);f.sqlite.close();
});

test('invalid, oversized and unavailable uploads preserve saved profile and files',async()=>{
  const f=fixture();const form=data();form.set('photo',image());await saveCreatorProfile(f.db,f.bucket,'alice',form);
  const before={...f.sqlite.prepare("SELECT * FROM creator_profiles WHERE user_id='alice'").get()};
  for(const bad of [new File(['<svg onload="alert(1)"/>'],'image.svg',{type:'image/svg+xml'}),new File([new Uint8Array(1500001)],'large.png',{type:'image/png'})]){
    const invalid=data();invalid.set('banner',bad);await assert.rejects(saveCreatorProfile(f.db,f.bucket,'alice',invalid),ProfileError);
  }
  const upload=data();upload.set('banner',image());await assert.rejects(saveCreatorProfile(f.db,undefined,'alice',upload),ProfileError);
  assert.deepEqual({...f.sqlite.prepare("SELECT * FROM creator_profiles WHERE user_id='alice'").get()},before);
  assert.equal(f.files.size,1);f.sqlite.close();
});

test('failed profile save cleans up new uploads and keeps previously saved images',async()=>{
  const f=fixture();const form=data();form.set('photo',image());await saveCreatorProfile(f.db,f.bucket,'alice',form);
  const previous=[...f.files.keys()];f.fail();const replacement=data();replacement.set('photo',image());replacement.set('banner',image());
  await assert.rejects(saveCreatorProfile(f.db,f.bucket,'alice',replacement),/Injected/);
  assert.deepEqual([...f.files.keys()],previous);f.sqlite.close();
});

test('public investments are scoped, deduplicated and exclude private, removed and unknown calls',async()=>{
  const f=fixture();
  for(const [id,visibility,archived] of [['public','public',null],['closed','public',null],['private','private',null],['removed','public',1]] as const){
    f.sqlite.prepare('INSERT INTO theses(id,owner,payload,visibility,archived_at,created_at) VALUES(?,?,?,?,?,?)').run(id,'maker',JSON.stringify({...EXAMPLES[0],id,title:id,example:false} ),visibility,archived,1);
  }
  let count=0;
  function order(user:string,id:string,side='buy'){f.sqlite.prepare('INSERT INTO orders(id,user_id,thesis_id,side,amount,created_at) VALUES(?,?,?,?,?,?)').run(String(++count),user,id,side,123456,count);}
  for(const id of ['public','closed','private','removed','unknown',EXAMPLES[0].id])order('alice',id);
  order('alice','public');order('bob','public');order('alice','non-investment','demo-fund');
  f.sqlite.prepare('INSERT INTO positions(id,user_id,thesis_id,amount,invested) VALUES(?,?,?,?,?)').run('p','alice','public',50000,40000);
  const result=await publicInvestments(f.db,'alice');
  assert.deepEqual(new Set(result.map(i=>i.thesis.id)),new Set(['public','closed',EXAMPLES[0].id]));
  assert.equal(result.find(i=>i.thesis.id==='public')!.active,true);assert.equal(result.find(i=>i.thesis.id==='closed')!.active,false);
  assert.equal(result.find(i=>i.thesis.id==='public')!.firstInvestedAt,1);assert.equal(result.find(i=>i.thesis.id==='public')!.lastInvestedAt,7);
  assert.ok(result.every(i=>Object.keys(i).sort().join(',')==='active,firstInvestedAt,lastInvestedAt,thesis'));
  assert.equal((await publicInvestments(f.db,'bob')).length,1);f.sqlite.close();
});

test('existing profiles stay private until they save investment visibility and follower counts use account IDs',async()=>{
  const f=fixture();const creator=await saveCreatorProfile(f.db,f.bucket,'alice',data());
  assert.equal(creator.publicInvestments,undefined);
  f.sqlite.prepare('INSERT INTO people_follows(follower_id,followee_id,created_at) VALUES(?,?,?)').run('bob','alice',1);
  f.sqlite.prepare('INSERT INTO people_follows(follower_id,followee_id,created_at) VALUES(?,?,?)').run('alice','editorial',2);
  assert.deepEqual(await profileFollowCounts(f.db,'alice'),{followerCount:1,followingCount:1});f.sqlite.close();
});

const statsCreator=(overrides:Partial<Creator>={}):Creator=>({id:'alice-profile',name:'Alice',handle:'alice',twitterUrl:'https://x.com/alice',avatarUrl:null,bio:'',...overrides});
test('creator counts include only published calls and distinct visible investments without list limits',async()=>{
  const f=fixture();
  for(const [id,owner,visibility,archived] of [['public','alice','public',null],['closed','alice','public',null],['private','alice','private',null],['removed','alice','public',1],['other','bob','public',null]] as const)
    f.sqlite.prepare('INSERT INTO theses(id,owner,payload,visibility,archived_at,created_at) VALUES(?,?,?,?,?,?)').run(id,owner,JSON.stringify({...EXAMPLES[0],id,example:false}),visibility,archived,1);
  let seq=0;
  for(const id of ['public','public','closed','private','removed','unknown',EXAMPLES[0].id])
    f.sqlite.prepare('INSERT INTO orders(id,user_id,thesis_id,side,amount,created_at) VALUES(?,?,?,?,?,?)').run(String(++seq),'alice',id,'buy',10000,seq);
  f.sqlite.prepare('INSERT INTO orders(id,user_id,thesis_id,side,amount,created_at) VALUES(?,?,?,?,?,?)').run('bob-buy','bob','other','buy',10000,10);
  const stats=await creatorStats(f.db,'alice',statsCreator({publicInvestments:true}));
  assert.deepEqual(stats,{takeCount:2,investmentCount:3,weeklyPnlCents:null,pnlVisibility:'private'});
  const hidden=await creatorStats(f.db,'alice',statsCreator({publicInvestments:false}));
  assert.equal(hidden.investmentCount,null);assert.equal(hidden.weeklyPnlCents,null);
  assert.ok(!JSON.stringify(hidden).includes('10000'));f.sqlite.close();
});

test('creator P&L matches the opted-in weekly ledger after fees and excludes funding and creator income',async()=>{
  const f=fixture(),now=Date.parse('2026-09-30T12:00:00Z'),start=Date.parse('2026-09-29T12:00:00Z');
  const rows=[['buy',10000,5,0,0],['scenario',11000,0,0,0],['sell',11000,0,5,30],['demo-fund',50000,0,0,0],['creator-income',1000,0,0,0]];
  rows.forEach(([side,amount,tradingFee,creatorFee,profitFee],i)=>f.sqlite.prepare('INSERT INTO orders(id,user_id,thesis_id,side,amount,trading_fee,creator_fee,platform_profit_fee,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(String(i),'alice',EXAMPLES[0].id,side,amount,tradingFee,creatorFee,profitFee,start+i));
  f.sqlite.prepare('INSERT INTO accounts(user_id,balance,revision) VALUES(?,?,?)').run('alice',1051965,1);
  const creator=statsCreator({publicInvestments:true,leaderboardOptIn:true});
  assert.deepEqual(await creatorStats(f.db,'alice',creator,now),{takeCount:0,investmentCount:1,weeklyPnlCents:965,pnlVisibility:'public'});
  f.sqlite.prepare('UPDATE accounts SET balance=balance+1 WHERE user_id=?').run('alice');
  const invalid=await creatorStats(f.db,'alice',creator,now);
  assert.equal(invalid.weeklyPnlCents,null);assert.equal(invalid.pnlVisibility,'unavailable');f.sqlite.close();
});

test('creators who have opted out never expose P&L, and an idle enrolled account has zero weekly P&L',async()=>{
  const f=fixture();
  f.sqlite.prepare('INSERT INTO accounts(user_id,balance,revision) VALUES(?,?,?)').run('alice',1000000,1);
  const privateStats=await creatorStats(f.db,'alice',statsCreator());
  assert.equal(privateStats.pnlVisibility,'private');assert.equal(privateStats.weeklyPnlCents,null);
  const idle=await creatorStats(f.db,'alice',statsCreator({leaderboardOptIn:true}));
  assert.equal(idle.pnlVisibility,'public');assert.equal(idle.weeklyPnlCents,0);f.sqlite.close();
});
