import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {nameTake,categoryForTake} from '../lib/take-name';
import {describeTake,generateTakeImage,imagePrompt,IMAGE_MODEL} from '../lib/take-identity';
import {readThesis,storedThesis} from '../lib/thesis-store';
import {EXAMPLES} from '../lib/data';

function fixture(){
 const sqlite=new DatabaseSync(':memory:');
 for(const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort())sqlite.exec(readFileSync(new URL(`../drizzle/${name}`,import.meta.url),'utf8'));
 const db={prepare:(sql:string)=>({bind:(...values:(string|number)[])=>({first:async()=>sqlite.prepare(sql).get(...values)||null})})} as unknown as D1Database;
 return {sqlite,db};
}
test('names fit the author’s subject and majors take takes priority over individual assets',()=>{
 assert.equal(nameTake('Privacy coins are going to rip','Privacy'),'Privacy Unbound');
 assert.equal(nameTake('Short all gaming tokens','Gaming'),'Game Over');
 assert.equal(nameTake('This is the bottom for BTC and ETH majors','Majors'),'The Majors Revival');
 assert.equal(nameTake('I am big on gotcha machines','Gaming'),'The Collector Economy');
 assert.equal(categoryForTake('Stock token platforms will win'),'Stock tokens');
 const generic=nameTake('I think decentralized storage adoption doubles','Custom');assert.match(generic,/Decentralized Storage Adoption/);assert.ok(generic.length<=70);
});
test('private owner lookup rejects another owner and anonymous readers',async()=>{
 const {sqlite,db}=fixture(),t={...EXAMPLES[0],id:'private-fixture',owner:'spoofed',visibility:'public'};
 sqlite.prepare('INSERT INTO theses(id,owner,payload,created_at,visibility) VALUES(?,?,?,?,?)').run(t.id,'alice',JSON.stringify(t),1,'private');
 assert.equal(await readThesis(db,t.id),undefined);assert.equal(await readThesis(db,t.id,'bob'),undefined);
 const own=await readThesis(db,t.id,'alice');assert.equal(own?.owner,'alice');assert.equal(own?.visibility,'private');
 sqlite.prepare("UPDATE theses SET visibility='public' WHERE id=?").run(t.id);assert.equal((await readThesis(db,t.id,'bob'))?.visibility,'public');sqlite.close();
});
test('schema preserves existing public takes and canonical image fields override payload',()=>{
 const {sqlite}=fixture();sqlite.prepare('INSERT INTO theses(id,owner,payload,created_at) VALUES(?,?,?,?)').run('legacy','alice','{}',1);
 assert.equal((sqlite.prepare('SELECT visibility FROM theses').get() as {visibility:string}).visibility,'public');
 const t=storedThesis({payload:JSON.stringify({artworkId:'spoofed',artworkStatus:'ready'}),owner:'alice',visibility:'private',artwork_id:'real',artwork_status:'failed'});
 assert.equal(t.artworkId,'real');assert.equal(t.artworkStatus,'failed');sqlite.close();
});
test('saved exposure takes shed automatic USDC reserves while explicit stables stay intact',()=>{
 const base={...EXAMPLES.find(t=>t.id==='privacy-repriced')!,allocations:[{symbol:'XMR',weight:50},{symbol:'ZEC',weight:40},{symbol:'USDC',weight:10}]};
 const row={payload:JSON.stringify(base),owner:'alice',visibility:'public'};
 const t=storedThesis(row);
 assert.deepEqual(t.allocations,[{symbol:'XMR',weight:56},{symbol:'ZEC',weight:44}]);
 assert.equal(t.version,base.version+1);assert.equal(JSON.parse(row.payload).allocations.length,3);
 const stable={...base,body:'Be in stables for this next week',allocations:[{symbol:'USDC',weight:100}]};
 assert.deepEqual(storedThesis({...row,payload:JSON.stringify(stable)}).allocations,stable.allocations);
});
test('image byte authorization requires ownership or a matching public reference',()=>{
 const {sqlite}=fixture();sqlite.prepare("INSERT INTO take_identities(id,owner,thesis_id,body,category,title,status,image_key,request_hash,created_at,updated_at) VALUES('art','alice','t','body','Privacy','Name','ready','private.webp','hash',1,1)").run();
 const query=sqlite.prepare("SELECT a.image_key FROM take_identities a WHERE a.id=? AND a.status='ready' AND (a.owner=? OR EXISTS(SELECT 1 FROM theses t WHERE t.artwork_id=a.id AND t.owner=a.owner AND t.visibility='public'))");
 assert.ok(query.get('art','alice'));assert.equal(query.get('art','bob'),undefined);
 sqlite.prepare("INSERT INTO theses(id,owner,payload,created_at,visibility,artwork_id) VALUES('t','alice','{}',1,'private','art')").run();assert.equal(query.get('art',''),undefined);
 sqlite.prepare("UPDATE theses SET visibility='public'").run();assert.ok(query.get('art',''));sqlite.close();
});
test('AI naming uses strict structured output and passes the take as untrusted subject matter',async()=>{
 let sent:Record<string,unknown>={};
 const fetcher=(async(_url,options)=>{sent=JSON.parse(String(options?.body));return Response.json({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify({title:'Privacy Unbound',imageConcept:'A luminous vault floating inside violet clouds'})}]}]});}) as typeof fetch;
 const result=await describeTake('Privacy coins will grow','Privacy','test-fixture-key',fetcher);
 assert.equal(result.title,'Privacy Unbound');assert.equal(sent.store,false);assert.match(String(sent.instructions),/untrusted/);assert.equal((sent.text as {format:{strict:boolean}}).format.strict,true);
});
test('original artwork uses webp and validates provider bytes without exposing URLs',async()=>{
 const bytes=Uint8Array.from([...Buffer.from('RIFF'),0,0,0,0,...Buffer.from('WEBP'),0,0,0,0]);let sent:Record<string,unknown>={};
 const fetcher=(async(_url,options)=>{sent=JSON.parse(String(options?.body));return Response.json({data:[{b64_json:Buffer.from(bytes).toString('base64')}]});}) as typeof fetch;
 assert.deepEqual(await generateTakeImage(imagePrompt('Luminous privacy vault','Privacy will grow'),'test-fixture-key',undefined,fetcher),bytes);
 assert.equal(sent.model,IMAGE_MODEL);assert.equal(sent.size,'1536x1024');assert.equal(sent.output_format,'webp');assert.equal(sent.n,1);assert.equal(sent.response_format,undefined);
});
test('failed or malformed image responses do not silently retry paid generation',async()=>{
 let requests=0;
 const fetcher=(async()=>{requests++;return Response.json({data:[{b64_json:Buffer.from('not an image').toString('base64')}]});}) as typeof fetch;
 await assert.rejects(generateTakeImage('concept','test-fixture-key',undefined,fetcher),/unexpected format/);assert.equal(requests,1);
 const denied=(async()=>new Response('private provider detail',{status:401})) as typeof fetch;
 await assert.rejects(generateTakeImage('concept','test-fixture-key',undefined,denied),/temporarily unavailable/);
});
