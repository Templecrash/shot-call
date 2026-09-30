import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES,TOKENS,type Thesis} from '../lib/data';
import {assessHedge,hedgeInputError,readHedgeSnapshot} from '../lib/hedge-assessment';
const now=1800000000000;
const snapshot={checkedAt:now,markets:['BTC','ETH','SOL'].map(symbol=>({symbol,maxLeverage:10,maintenanceBps:500,markPrice:100,funding:.0001}))};
const take=(id:string)=>EXAMPLES.find(t=>t.id===id)!;

test('matching spot hedge and leveraged short reduction use notional, not equal collateral',()=>{
 const thesis:Thesis={...take('majors-bottom'),allocations:[{symbol:'BTC',weight:60},{symbol:'ETH',weight:40,execution:'perps',side:'short',leverage:2}]};
 const before=JSON.stringify(thesis),result=assessHedge(thesis,100000,snapshot,now);
 const btc=result.legs.find(l=>l.symbol==='BTC')!,eth=result.legs.find(l=>l.symbol==='ETH')!;
 assert.equal(btc.notional,60000);assert.equal(btc.offset,15000);assert.equal(btc.remaining,45000);assert.equal(btc.collateral,15000);assert.match(btc.title,/SHORT BTC/);
 assert.equal(eth.notional,80000);assert.equal(eth.offset,20000);assert.equal(eth.remaining,60000);assert.equal(eth.collateral,undefined);assert.match(eth.title,/Reduce the SHORT/);
 assert.equal(JSON.stringify(thesis),before);
});
test('stable-only call adds no directional hedge or dollar offset',()=>{
 const r=assessHedge(take('week-in-stables'),100000,snapshot,now);
 assert.match(r.summary,/No directional hedge/);assert.equal(r.legs[0].offset,undefined);assert.equal(r.legs[0].collateral,undefined);
});
test('unsupported and failed-market cases suggest reducing exposure without claiming a derivative',()=>{
 const t:Thesis={...take('majors-bottom'),allocations:[{symbol:'BTC',weight:50},{symbol:'CARDS',weight:50}]};
 const r=assessHedge(t,100000,snapshot,now);
 assert.equal(r.legs.filter(l=>l.collateral!==undefined).length,1);
 assert.match(r.legs.find(l=>l.symbol==='CARDS')!.reason,/No matching perp/);
 const failed=assessHedge(t,100000,null,now);assert.equal(failed.checkedAt,null);assert.ok(failed.legs.every(l=>l.collateral===undefined));
});
test('cg identities must match the pinned asset rather than just its ticker',()=>{
 const t:Thesis={...take('majors-bottom'),allocations:[{symbol:'cg:bitcoin',weight:100}],tokens:{'cg:bitcoin':{...TOKENS.BTC,coingeckoId:'bitcoin'}}};
 assert.equal(assessHedge(t,100000,snapshot,now).legs[0].collateral,25000);
 t.tokens!['cg:bitcoin']={...TOKENS.BTC,coingeckoId:'lookalike-bitcoin'};
 assert.equal(assessHedge(t,100000,snapshot,now).legs[0].collateral,undefined);
});
test('Polymarket guidance does not invent quantities or equate dollars to shares',()=>{
 const r=assessHedge(take('hormuz-reopened'),100000,snapshot,now);
 const event=r.legs.find(l=>l.key==='HORMUZYES')!;
 assert.match(event.reason,/share count, not equal dollars/);assert.equal(event.offset,undefined);assert.ok(event.marketUrl);assert.equal(r.legs.length,3);
});
test('invalid budgets, total weights and leverage cannot produce sizing',()=>{
 const t=take('majors-bottom');
 for(const budget of [0,-1,NaN,Infinity])assert.throws(()=>assessHedge(t,budget,snapshot,now));
 assert.ok(hedgeInputError({...t,allocations:[{symbol:'BTC',weight:50}]},100000));
 for(const leverage of [0,-1,NaN,11,1.5])assert.ok(hedgeInputError({...t,allocations:[{symbol:'BTC',weight:100,execution:'perps',leverage}]},100000));
});
test('old, future or malformed market snapshots do not verify any market',()=>{
 for(const s of [null,{}, {...snapshot,checkedAt:now-120001},{...snapshot,checkedAt:now+5001},{...snapshot,markets:[{...snapshot.markets[0],markPrice:0}]}])assert.equal(readHedgeSnapshot(s,now),null);
 assert.equal(assessHedge(take('majors-bottom'),100000,{...snapshot,checkedAt:now-120001},now).legs.filter(l=>l.collateral!==undefined).length,0);
 assert.deepEqual(readHedgeSnapshot(snapshot,now),snapshot);
});
test('new allocation and leverage versions recompute the size',()=>{
 const t=take('bitcoin-amplified');
 assert.equal(assessHedge(t,100000,snapshot,now).legs[0].notional,300000);
 assert.equal(assessHedge({...t,allocations:[{...t.allocations[0],leverage:5}]},200000,snapshot,now).legs[0].notional,1000000);
});
