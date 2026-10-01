import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {initializeInviteCohort,isMember,createMemberInvite,memberInvitesState,redeemInvite,previewInvite,inviteCode,inviteReturnTo,InviteError} from '../lib/invites';
import {NextRequest} from 'next/server';
import {proxy} from '../proxy';

function fixture(){
  const sqlite=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../drizzle/${file}`,import.meta.url),'utf8'));
  sqlite.prepare('INSERT INTO accounts(user_id) VALUES(?)').run('existing');let failAt=-1;
  class Statement{
    values:(string|number|null)[]=[];constructor(public sql:string){}
    bind(...v:(string|number|null)[]){this.values=v;return this;}
    async first(){return sqlite.prepare(this.sql).get(...this.values)||null;}
    async all(){return {results:sqlite.prepare(this.sql).all(...this.values),success:true};}
    async run(){return {meta:sqlite.prepare(this.sql).run(...this.values),success:true};}
  }
  const db={prepare:(sql:string)=>new Statement(sql),async batch(statements:Statement[]){
    sqlite.exec('BEGIN IMMEDIATE');try{
      const result=statements.map((s,i)=>{if(i===failAt)throw new Error('Temporary failure');const stmt=sqlite.prepare(s.sql);return /^\s*SELECT/i.test(s.sql)?{results:stmt.all(...s.values)}:{results:[],meta:stmt.run(...s.values)};});sqlite.exec('COMMIT');return result;
    }catch(e){sqlite.exec('ROLLBACK');throw e;}
  }} as unknown as D1Database;
  return {db,sqlite,fail:(index:number)=>{failAt=index;}};
}
test('legacy invite membership preserves its original cohort without enrolling later accounts',async()=>{
  const f=fixture();await initializeInviteCohort(f.db,10);assert.equal(await isMember(f.db,'existing'),true);
  f.sqlite.prepare('INSERT INTO accounts(user_id) VALUES(?)').run('late');await initializeInviteCohort(f.db,20);
  assert.equal(await isMember(f.db,'late'),false);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM app_members').get()!.n,1);f.sqlite.close();
});
test('each member has exactly five persistent, single-use invite slots',async()=>{
  const f=fixture();const links=await Promise.all([1,2,3,4,5].map(slot=>createMemberInvite(f.db,'existing',slot)));
  assert.equal(new Set(links.map(l=>l.code)).size,5);assert.equal((await createMemberInvite(f.db,'existing',1)).code,links[0].code);
  await assert.rejects(createMemberInvite(f.db,'existing',6),InviteError);await assert.rejects(createMemberInvite(f.db,'stranger',1),InviteError);
  assert.equal((await memberInvitesState(f.db,'existing')).remaining,5);assert.equal((await previewInvite(f.db,links[0].code))?.available,true);
  await redeemInvite(f.db,'newcomer',links[0].code,30);const state=await memberInvitesState(f.db,'existing');assert.equal(state.remaining,4);assert.equal(state.slots[0].claimed,true);assert.equal(state.slots[0].code,null);
  assert.equal((await memberInvitesState(f.db,'newcomer')).remaining,5);assert.equal((await previewInvite(f.db,links[0].code))?.available,false);
  await assert.rejects(createMemberInvite(f.db,'existing',1),InviteError);await assert.rejects(redeemInvite(f.db,'another',links[0].code),InviteError);
  f.sqlite.close();
});
test('two people cannot claim the same invite, and retries do not consume extra slots',async()=>{
  const f=fixture(),link=await createMemberInvite(f.db,'existing',1);
  const results=await Promise.allSettled([redeemInvite(f.db,'alice',link.code),redeemInvite(f.db,'bob',link.code)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await memberInvitesState(f.db,'existing')).remaining,4);
  const winner=f.sqlite.prepare('SELECT claimed_by FROM member_invites WHERE code=?').get(link.code)!.claimed_by as string;
  assert.equal((await redeemInvite(f.db,winner,link.code)).alreadyMember,true);assert.equal((await memberInvitesState(f.db,winner)).total,5);f.sqlite.close();
});
test('one person cannot consume two invites while accepting concurrently',async()=>{
  const f=fixture(),a=await createMemberInvite(f.db,'existing',1),b=await createMemberInvite(f.db,'existing',2);
  await Promise.all([redeemInvite(f.db,'new',a.code),redeemInvite(f.db,'new',b.code)]);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM member_invites WHERE claimed_by=?').get('new')!.n,1);assert.equal((await memberInvitesState(f.db,'existing')).remaining,4);f.sqlite.close();
});
test('membership creation and invite redemption roll back together on failure',async()=>{
  const f=fixture(),link=await createMemberInvite(f.db,'existing',1);f.fail(1);
  await assert.rejects(redeemInvite(f.db,'new',link.code),/Temporary failure/);assert.equal(await isMember(f.db,'new'),false);assert.equal((await previewInvite(f.db,link.code))?.available,true);
  f.fail(-1);await redeemInvite(f.db,'new',link.code);assert.equal(await isMember(f.db,'new'),true);f.sqlite.close();
});
test('demo pages and APIs pass through without membership while personal responses stay uncached',()=>{
  const identities:HeadersInit[]=[{}, {'oai-authenticated-user-id':'new-user','oai-authenticated-user-email':'new@example.test'}];
  for(const headers of identities){
    for(const path of ['/','/take/majors-bottom','/creator/editorial','/api/state','/api/demo-wallet','/api/generate']){
      const response=proxy(new NextRequest('https://calledit.test'+path,{headers}));
      assert.equal(response.headers.get('x-middleware-next'),'1');
      assert.equal(response.headers.get('location'),null);
      assert.equal(response.headers.get('cache-control'),'private, no-store');
    }
  }
});
test('invalid links and external return paths cannot create membership or redirect outside the app',()=>{
  const code='a'.repeat(48);assert.equal(inviteCode(`https://calledit.test/invite/${code}`),code);assert.equal(inviteCode('anything'),null);assert.equal(inviteCode('b'.repeat(47)),null);
  for(const path of ['https://evil.test','//evil.test','/\\evil.test','/invite/foo','/signin-with-chatgpt','/api/state'])assert.equal(inviteReturnTo(path),'/');assert.equal(inviteReturnTo('/take/majors-bottom?tab=invest'),'/take/majors-bottom?tab=invest');
});
