import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {ownPnlCard,savePnlCard,savedPnlCard,readPnlImage,PnlCardError} from '../lib/pnl-card-store';
import {EXAMPLES} from '../lib/data';
function fixture(){
  const sqlite=new DatabaseSync(':memory:');for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../drizzle/${name}`,import.meta.url),'utf8'));
  sqlite.prepare('INSERT INTO accounts(user_id,balance,revision) VALUES(?,?,?)').run('alice',990000,2);
  sqlite.prepare('INSERT INTO orders(id,user_id,thesis_id,side,amount,created_at) VALUES(?,?,?,?,?,?)').run('alice-order','alice',EXAMPLES[0].id,'buy',10000,1);
  sqlite.prepare('INSERT INTO orders(id,user_id,thesis_id,side,amount,created_at) VALUES(?,?,?,?,?,?)').run('bob-order','bob',EXAMPLES[0].id,'buy',10000,1);
  sqlite.prepare('INSERT INTO positions(id,user_id,thesis_id,amount,invested) VALUES(?,?,?,?,?)').run('position','alice',EXAMPLES[0].id,12000,10000);
  let fail=false;class Statement{values:(string|number|null)[]=[];constructor(public sql:string){}bind(...v:(string|number|null)[]){this.values=v;return this;}async first(){return sqlite.prepare(this.sql).get(...this.values)||null;}async all(){return {results:sqlite.prepare(this.sql).all(...this.values),success:true};}async run(){if(fail)throw new Error('Save failed');return {meta:sqlite.prepare(this.sql).run(...this.values),success:true};}}
  const db={prepare:(sql:string)=>new Statement(sql),async batch(statements:Statement[]){return Promise.all(statements.map(s=>s.all()));}} as unknown as D1Database;
  const files=new Map<string,Uint8Array>();const bucket={async put(key:string,bytes:Uint8Array){files.set(key,bytes);},async delete(key:string){files.delete(key);}} as unknown as R2Bucket;
  const image=new File([new Uint8Array([137,80,78,71,13,10,26,10,...Array(20).fill(0)])],'card.png',{type:'image/png'});
  return {sqlite,db,bucket,files,image,fail:()=>{fail=true;}};
}
test('only the owner can preview a trade and a snapshot changes when its valuation changes',async()=>{
  const f=fixture();await assert.rejects(ownPnlCard(f.db,'alice','trade','bob-order',false),PnlCardError);
  const original=await ownPnlCard(f.db,'alice','trade','alice-order',false,10);assert.equal(original.card.profit,20);assert.equal(original.card.percent,20);
  f.sqlite.prepare('UPDATE positions SET amount=11000').run();const changed=await ownPnlCard(f.db,'alice','trade','alice-order',false,10);assert.notEqual(original.fingerprint,changed.fingerprint);f.sqlite.close();
});
test('hidden amounts never enter public snapshot fields and saving freezes the dated result',async()=>{
  const f=fixture(),preview=await ownPnlCard(f.db,'alice','trade','alice-order',true,10);
  for(const key of ['profit','cost','realized','unrealized'] as const)assert.equal(preview.card[key],null);
  const saved=await savePnlCard(f.db,f.bucket,'alice',preview.card,f.image);f.sqlite.prepare('UPDATE positions SET amount=8000').run();
  const publicCard=await savedPnlCard(f.db,saved.id);assert.deepEqual(publicCard,preview.card);assert.equal(publicCard!.percent,20);assert.equal(f.files.size,1);f.sqlite.close();
});
test('sharing a private call reveals no holdings, private artwork URL or thesis link',async()=>{
  const f=fixture();f.sqlite.prepare('INSERT INTO theses(id,owner,payload,visibility,created_at) VALUES(?,?,?,?,?)').run(EXAMPLES[0].id,'alice',JSON.stringify({...EXAMPLES[0],title:'Private idea',artworkId:'private-art',artworkStatus:'ready'}),'private',1);
  // Built-in examples win lookup; use a distinct private id for this case.
  f.sqlite.prepare('UPDATE theses SET id=?').run('private-call');f.sqlite.prepare('UPDATE orders SET thesis_id=? WHERE user_id=?').run('private-call','alice');f.sqlite.prepare('UPDATE positions SET thesis_id=?').run('private-call');
  const {card}=await ownPnlCard(f.db,'alice','trade','alice-order',false,10);assert.equal(card.thesisPath,null);assert.equal(card.title,'Private idea');assert.ok(!JSON.stringify(card).includes('private-art'));assert.ok(!('allocations' in card));f.sqlite.close();
});
test('storage failure removes the temporary card image and creates no public record',async()=>{
  const f=fixture(),preview=await ownPnlCard(f.db,'alice','trade','alice-order',false,10);f.fail();await assert.rejects(savePnlCard(f.db,f.bucket,'alice',preview.card,f.image),/Save failed/);assert.equal(f.files.size,0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM pnl_cards').get()!.n,0);f.sqlite.close();
});
test('PNG uploads are bounded even without a content-length header',async()=>{
  const valid=new Request('https://calledit.test/api/pnl',{method:'POST',headers:{'Content-Type':'image/png'},body:new Uint8Array([137,80,78,71,13,10,26,10])});
  assert.equal((await readPnlImage(valid)).size,8);
  await assert.rejects(readPnlImage(new Request('https://calledit.test/api/pnl',{method:'POST',headers:{'Content-Type':'image/png'},body:new Uint8Array(5000001)})),(e:unknown)=>e instanceof PnlCardError&&e.status===413);
  await assert.rejects(readPnlImage(new Request('https://calledit.test/api/pnl',{method:'POST',headers:{'Content-Type':'image/svg+xml'},body:'<svg/>'})),PnlCardError);
});
