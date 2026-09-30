import assert from 'node:assert/strict';
import test from 'node:test';
import {EXAMPLES,curatedTake} from '../lib/data';
import {stockScenarioPct,externalStrategy,positionDirection} from '../lib/external-strategy';
import {freezeBasket} from '../lib/predictions/model';
import {perpCoverage} from '../lib/perps';
const take=EXAMPLES.find(t=>t.id==='hormuz-reopened')!;
test('oil falls benefit paper shorts, oil rises lose, YES stays fixed without a default cash reserve',()=>{
 assert.ok(externalStrategy(take));
 assert.ok(Math.abs(stockScenarioPct(take,-10)-7.8)<1e-9);
 assert.ok(Math.abs(stockScenarioPct(take,10)+7.8)<1e-9);
 assert.equal(positionDirection(take,'BNOON'),'SHORT');
 assert.equal(positionDirection(take,'HORMUZYES'),'YES');
 const long={...take,allocations:take.allocations.map(a=>({...a,side:'long' as const}))};
 assert.ok(Math.abs(stockScenarioPct(long,-10)+7.8)<1e-9);
 assert.throws(()=>stockScenarioPct(take,Infinity));
});
test('short and outcome baskets never enter long-only return pools or partial perps',()=>{
 assert.throws(()=>freezeBasket(take),/unavailable.*short baskets/);
 const fork={...take,allocations:[...take.allocations,{symbol:'ETH',weight:1}]};
 assert.equal(perpCoverage(fork,[{symbol:'ETH',markPrice:3000,maxLeverage:10,maintenanceBps:500,funding:0}]).legs.length,0);
});

test('a broad gaming short gains when its ten token underlyings fall and loses when they rise',()=>{
 const gaming=EXAMPLES.find(t=>t.id==='game-over')!;
 assert.equal(gaming.allocations.length,10);
 assert.equal(gaming.allocations.reduce((sum,a)=>sum+a.weight,0),100);
 assert.ok(gaming.allocations.every(a=>a.side==='short'&&a.symbol!=='USDC'));
 assert.ok(Math.abs(stockScenarioPct(gaming,-10)-10)<1e-9);
 assert.ok(Math.abs(stockScenarioPct(gaming,10)+10)<1e-9);
 assert.ok(Math.abs(stockScenarioPct({...gaming,allocations:[...gaming.allocations.map(a=>({...a,weight:a.weight/2})),{symbol:'USDC',weight:50}]},-10)-5)<1e-9);
 assert.throws(()=>freezeBasket(gaming),/short baskets/);
});

test('an explicit gaming short prompt keeps all ten short directions in its curated draft',()=>{
 const draft=curatedTake('Short all gaming tokens')!;
 assert.equal(draft.parent,'game-over');
 assert.equal(draft.allocations.length,10);
 assert.ok(draft.allocations.every(a=>a.side==='short'));
 const bullish=curatedTake('Gaming is going to rip')!;
 assert.notEqual(bullish.parent,'game-over');
 assert.ok(bullish.allocations.every(a=>a.side!=='short'));
});
