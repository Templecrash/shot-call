import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EXAMPLES,type Position,type Thesis} from '../lib/data';
import {exposureGroups,assessPosition,positionExecution} from '../lib/position-design';
import {perpCoverage,type PerpMarket} from '../lib/perps';
const take=(id:string)=>EXAMPLES.find(t=>t.id===id)!;
const markets:PerpMarket[]=['BTC','ETH','SOL'].map(symbol=>({symbol,maxLeverage:10,maintenanceBps:500,markPrice:100,funding:.0001}));
test('all curated allocations appear once and retain their original weights and sides',()=>{
  for(const thesis of EXAMPLES){const rows=exposureGroups(thesis).flatMap(g=>g.allocations);assert.equal(rows.length,thesis.allocations.length);assert.deepEqual([...rows].sort((a,b)=>a.symbol.localeCompare(b.symbol)),[...thesis.allocations].sort((a,b)=>a.symbol.localeCompare(b.symbol)));assert.equal(exposureGroups(thesis).reduce((n,g)=>n+g.weight,0),100);}
});
test('Hormuz stock shorts and YES event are independent exposure groups',()=>{
  const groups=exposureGroups(take('hormuz-reopened'));
  assert.deepEqual(groups.map(g=>[g.kind,g.weight]),[['stocks',78],['prediction',22]]);
  assert.equal(groups[0].allocations.every(a=>a.side==='short'),true);
  const review=assessPosition(take('hormuz-reopened'),null);
  assert.match(review.hedge,/neither hedges the other/);
  assert.match(review.review,/announcement alone does not qualify/);
});
test('stablecoin call suggests no directional hedge or yield promise',()=>{
  assert.equal(exposureGroups(take('week-in-stables'))[0].kind,'stables');
  const review=assessPosition(take('week-in-stables'),null);
  assert.match(review.hedge,/No directional hedge/);assert.match(review.alternative,/does not earn automatic yield/);assert.equal(review.hedgeLeg,undefined);
});
test('perp eligibility never changes a spot holding into a derivative',()=>{
  const thesis=take('majors-bottom'),coverage=perpCoverage(thesis,markets);
  assert.equal(coverage.weight,100);assert.equal(exposureGroups(thesis)[0].kind,'tokens');
  const review=assessPosition(thesis,coverage);assert.match(review.route,/Spot at 1×/);assert.equal(review.hedgeLeg?.symbol,'BTC');
});
test('actual perps use recorded keys, unsupported assets become collateral with no duplicate spot holdings',()=>{
  const thesis:Thesis={...take('majors-bottom'),allocations:[{symbol:'BTC',weight:60},{symbol:'AKT',weight:40}]};
  const position={executionMode:'perps',perpMarkets:JSON.stringify([{key:'BTC',symbol:'BTC',weight:60}])} as Position;
  assert.deepEqual(exposureGroups(thesis,positionExecution(position)).map(g=>[g.kind,g.weight]),[['perps',60],['collateral',40]]);
  assert.equal(exposureGroups(thesis,positionExecution(position)).some(g=>g.kind==='tokens'),false);
  assert.equal(exposureGroups(thesis,positionExecution({...position,perpMarkets:'malformed'}))[0].kind,'collateral');
});
test('an explicit amplified BTC call gets a perp route only with verified complete coverage',()=>{
  const thesis=take('bitcoin-amplified');assert.match(assessPosition(thesis,perpCoverage(thesis,markets)).route,/creator/);
  assert.match(assessPosition(thesis,null).route,/creator/);assert.equal(assessPosition(thesis,null).hedgeLeg,undefined);
});
test('gaming shorts remain directed shorts, and an opposite event side stays NO',()=>{
  const thesis=take('game-over');assert.ok(thesis);assert.equal(exposureGroups(thesis)[0].kind,'shorts');assert.equal(assessPosition(thesis,null).hedgeLeg,undefined);
  const counter:Thesis={...take('hormuz-reopened'),allocations:[{symbol:'HORMUZYES',weight:100,side:'short'}]};assert.equal(exposureGroups(counter)[0].kind,'prediction');assert.equal(exposureGroups(counter)[0].allocations[0].side,'short');
});

test('old perp snapshots retain contract weights when the example basket later changes',()=>{
 const thesis=take('majors-bottom');
 const position={executionMode:'perps',perpWeight:90,perpMarkets:JSON.stringify([{key:'BTC',weight:40},{key:'ETH',weight:35},{key:'SOL',weight:15}])} as Position;
 const groups=exposureGroups(thesis,positionExecution(position));
 assert.deepEqual(groups.map(g=>[g.kind,g.weight]),[['perps',90],['collateral',10]]);
 assert.deepEqual(groups[0].allocations.map(a=>a.weight),[40,35,15]);
 const notional=900000;assert.equal(groups[0].allocations.reduce((n,a)=>n+notional*a.weight/position.perpWeight!,0),notional);
});

test('legacy spot stays spot when creator example gains perps',()=>{const thesis=take('bitcoin-amplified'),p={executionMode:'spot',amount:10000} as Position;assert.equal(exposureGroups(thesis,positionExecution(p))[0].kind,'tokens');});
