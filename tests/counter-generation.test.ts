import assert from 'node:assert/strict';
import test from 'node:test';
import {EXAMPLES,type Thesis} from '../lib/data';
import {assembleCounter,generateCounter,validateGeneratedCounter,validateCounterOutcomes} from '../lib/counter-generation';
import {createCounterDraft,readCounterDraft,savedCounterDraft} from '../lib/counter-store';
import {storedThesis} from '../lib/thesis-store';
import {normalizePolymarket} from '../lib/polymarket';
import {HORMUZ_MARKET} from '../lib/hormuz-market';
import {tokenFit} from '../lib/research';
import {ledger} from './helpers/ledger';

const source=EXAMPLES.find(t=>t.id==='majors-bottom')!;
const markets=['BTC','ETH','SOL','IMX','GALA'].map(symbol=>({symbol,maxLeverage:10,maintenanceBps:500,markPrice:100,funding:.0001}));
const build=(t=source)=>assembleCounter(t,'generated',{markets,quotes:{},now:1234});
const quote=normalizePolymarket([{conditionId:HORMUZ_MARKET.conditionId,question:HORMUZ_MARKET.question,outcomes:['Yes','No'],outcomePrices:['.2','.8'],clobTokenIds:[HORMUZ_MARKET.yesTokenId,'1234'],active:true,closed:false,acceptingOrders:true,enableOrderBook:true}],HORMUZ_MARKET);

test('supported source longs become identity-checked 1x short perps and preserve relative weights',()=>{
  const before=structuredClone(source),draft=build();
  assert.deepEqual(source,before);
  assert.equal(draft.counter?.plan?.coveredWeight,100);
  assert.equal(draft.counter?.generationId,'generated');
  assert.deepEqual(draft.allocations,source.allocations.map(a=>({...a,side:'short',execution:'perps',leverage:1})));
  assert.equal(draft.exitPlan,undefined);
  assert.equal(draft.engine,'curated');
});
test('partial coverage reallocates only supported assets; ticker lookalikes cannot become perps',()=>{
  const partial=assembleCounter(source,'id',{markets:markets.filter(m=>m.symbol==='BTC'),quotes:{}});
  assert.deepEqual(partial.allocations,[{symbol:'BTC',weight:100,side:'short',execution:'perps',leverage:1}]);
  assert.equal(partial.counter?.plan?.coveredWeight,44);
  assert.equal(partial.counter?.plan?.omitted.length,2);
  const fake={...source,allocations:[{symbol:'cg:not-bitcoin',weight:100}],tokens:{'cg:not-bitcoin':{symbol:'BTC',name:'Lookalike',color:'#fff',icon:'',fit:'',reason:'',risk:'',source:'https://example.org',coingeckoId:'not-bitcoin'}}};
  assert.equal(build(fake).allocations.length,0);
});
test('gacha has no fabricated direct shorts; verified sector alternatives are optional',()=>{
  const gacha=EXAMPLES.find(t=>t.id==='gacha-collectibles')!,draft=build(gacha),plan=draft.counter!.plan!;
  assert.equal(draft.allocations.length,0);
  assert.equal(plan.coveredWeight,0);
  assert.deepEqual(plan.omitted.map(x=>x.symbol),['CARDS','FWA']);
  assert.deepEqual(plan.routes.map(x=>x.allocation.symbol),['IMX','GALA']);
  assert.ok(plan.routes.every(r=>r.kind==='alternative'&&r.allocation.weight===0&&r.allocation.execution==='perps'));
  const selected={...plan.routes[0].allocation,weight:100};
  assert.ok(validateGeneratedCounter(gacha,gacha.version,[selected],draft));
  assert.equal(tokenFit({...draft,allocations:[selected]},'IMX').kind,'Adjacent');
  assert.throws(()=>validateGeneratedCounter(gacha,gacha.version,[{...selected,execution:'spot'}],draft),/not spot/);
  const unavailable=assembleCounter(gacha,'id',{markets:[],quotes:{}});
  assert.equal(unavailable.counter?.plan?.routes.length,0);
});
test('reversal clears inherited leverage; shorts become spot longs and stables are omitted',()=>{
  const original={...source,allocations:[{symbol:'BTC',weight:80,side:'short' as const,execution:'perps' as const,leverage:10},{symbol:'USDC',weight:20}]};
  const draft=build(original);
  assert.deepEqual(draft.allocations,[{symbol:'BTC',weight:100,execution:'spot',leverage:1,side:'long'}]);
  assert.equal(draft.counter?.plan?.omitted[0].symbol,'USDC');
});
test('Polymarket reverses the same open question to NO, then back to YES, without leverage',async()=>{
  const hormuz=EXAMPLES.find(t=>t.id==='hormuz-reopened')!;
  const draft=assembleCounter(hormuz,'counter',{markets,quotes:{HORMUZYES:quote}});
  assert.equal(draft.allocations.find(a=>a.symbol==='HORMUZYES')?.side,'short');
  assert.equal(draft.allocations.find(a=>a.symbol==='BNOON')?.side,'long');
  const outcome=draft.counter!.plan!.routes.find(r=>r.kind==='outcome')!;
  assert.equal(outcome.question,HORMUZ_MARKET.question);assert.equal(outcome.price,.8);
  const back=assembleCounter(draft,'back',{markets,quotes:{HORMUZYES:quote}});
  assert.equal(back.allocations.find(a=>a.symbol==='HORMUZYES')?.side,'long');
  assert.equal(back.allocations.some(a=>a.symbol==='BNOON'),false);
  await assert.rejects(()=>validateCounterOutcomes(draft,async()=>({...quote,status:'closed'})),/no longer open/);
  await validateCounterOutcomes(draft,async()=>quote);
  for(const invalid of [{...quote,status:'closed' as const},{...quote,orderBookEnabled:false},null]){
    assert.equal(assembleCounter(hormuz,'id',{markets,quotes:{HORMUZYES:invalid}}).allocations.some(a=>a.symbol==='HORMUZYES'),false);
  }
});
test('market failures return explicit omitted positions, not unverified allocations or proxy assumptions',async()=>{
  const draft=await generateCounter(source,'id',{loadMarkets:async()=>{throw new Error('offline');}});
  assert.equal(draft.allocations.length,0);
  assert.match(draft.counter!.plan!.omitted[0].reason,/could not be checked/);
  assert.ok(draft.counter?.plan?.notes.some(n=>n.includes('could not be reached')));
});
test('verified plan rejects source changes, new symbols, wrong sides, spot shorts, and leveraged outcomes',()=>{
  const draft=build(),allocation=draft.allocations[0];
  assert.ok(validateGeneratedCounter(source,source.version,[{...allocation,weight:100,leverage:3}],draft));
  assert.throws(()=>validateGeneratedCounter(source,source.version+1,draft.allocations,draft),/changed/);
  assert.throws(()=>validateGeneratedCounter(source,source.version,[{...allocation,symbol:'GALA'}],draft),/verified counter/);
  assert.throws(()=>validateGeneratedCounter(source,source.version,[{...allocation,side:'long'}],draft),/directions/);
  assert.throws(()=>validateGeneratedCounter(source,source.version,[{...allocation,execution:'spot'}],draft),/not spot/);
  const original=EXAMPLES.find(t=>t.id==='hormuz-reopened')!,event=assembleCounter(original,'id',{markets,quotes:{HORMUZYES:quote}});
  assert.throws(()=>validateGeneratedCounter(original,original.version,[{symbol:'HORMUZYES',weight:100,side:'short',leverage:2}],event),/cannot use perp leverage/);
});
test('counter drafts persist per owner and request; replay never repeats generation',async()=>{
  const {db,sqlite}=ledger();let calls=0;
  const generate=async(t:Thesis,id:string)=>{calls++;return assembleCounter(t,id,{markets,quotes:{}});};
  const first=await createCounterDraft(db,'alice','request',source,generate);
  assert.equal(first.status,'complete');
  const replay=await createCounterDraft(db,'alice','request',source,generate);
  assert.equal(calls,1);assert.equal(replay.result,first.result);
  await assert.rejects(()=>readCounterDraft(db,'request','bob'),/unavailable/);
  await assert.rejects(()=>createCounterDraft(db,'bob','request',source,generate),/unavailable/);
  await assert.rejects(()=>createCounterDraft(db,'alice','request',{...source,version:99},generate),/another call/);
  const saved=await savedCounterDraft(db,'request','alice');
  const restored=storedThesis({payload:JSON.stringify(saved),owner:'alice',visibility:'private'});
  assert.deepEqual(restored.counter,saved.counter);
  assert.equal(calls,1);sqlite.close();
});
