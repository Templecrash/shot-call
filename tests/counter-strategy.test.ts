import assert from 'node:assert/strict';
import test from 'node:test';
import { EXAMPLES } from '../lib/data';
import { buildCounterStrategy, validateCounter } from '../lib/counter-strategy';
import { stockScenarioPct, positionDirection } from '../lib/external-strategy';
import { freezeBasket } from '../lib/predictions/model';

const source = EXAMPLES.find(t => t.category === 'Majors')!;
test('reverses positions, preserves reserve and provenance, without claiming new AI research', () => {
  const original = structuredClone(source);
  const counter = buildCounterStrategy(source, 'counter', 1000);
  assert.deepEqual(source, original);
  assert.equal(counter.parent, source.id);
  assert.equal(counter.visibility, 'private');
  assert.equal(counter.research, undefined);
  assert.equal(counter.owner, undefined);
  assert.equal(counter.counter?.sourceId, source.id);
  assert.equal(counter.counter?.betSide, undefined);
  for (const a of counter.allocations) assert.equal(a.side, a.symbol === 'USDC' ? undefined : 'short');
  const riskyWeight = source.allocations.filter(a => a.symbol !== 'USDC').reduce((s,a)=>s+a.weight,0);
  assert.equal(stockScenarioPct(counter, -10), riskyWeight / 10);
  assert.equal(stockScenarioPct(counter, 10), -riskyWeight / 10);
  assert.throws(() => freezeBasket(counter), /unavailable/);
});
test('countering a counter restores the long legs and retains source attribution', () => {
  const first = buildCounterStrategy(source, 'counter');
  const second = buildCounterStrategy(first, 'counter-again');
  assert.equal(second.counter?.sourceId, first.id);
  assert.equal(second.counter?.betThesisId, undefined);
  assert.equal(second.counter?.betSide, undefined);
  assert.equal(positionDirection(second, source.allocations.find(a=>a.symbol!=='USDC')!.symbol), 'LONG');
  assert.equal(stockScenarioPct(second, -10), -stockScenarioPct(first, -10));
});
test('server validation rejects stale sources, fabricated tokens, unchanged direction and all cash', () => {
  const counter = buildCounterStrategy(source, 'counter');
  assert.deepEqual(validateCounter(source, source.version, counter.allocations), counter.counter);
  assert.throws(() => validateCounter(source, source.version+1, counter.allocations), /changed/);
  assert.throws(() => validateCounter(source, source.version, source.allocations), /reverse/);
  assert.throws(() => validateCounter(source, source.version, [{symbol:'USDC',weight:100}]), /at least/);
  assert.throws(() => validateCounter(source, source.version, [{symbol:'FAKE',weight:100,side:'short'}]), /reverse/);
  const adjusted = counter.allocations.map(a=>({...a,weight:a.symbol==='USDC'?0:a.weight}));
  assert.equal(validateCounter(source, source.version, adjusted).sourceId,source.id);
});
test('countering external oil shorts goes long and reverses YES to NO without inventing a basket pool', () => {
  const hormuz = EXAMPLES.find(t => t.id === 'hormuz-reopened')!;
  const counter = buildCounterStrategy(hormuz, 'counter-oil');
  assert.equal(positionDirection(counter, 'BNOON'), 'LONG');
  assert.equal(positionDirection(counter, 'HORMUZYES'), 'NO');
  assert.ok(Math.abs(stockScenarioPct(counter, 10)-7.8)<1e-9);
  assert.equal(counter.counter?.betThesisId, undefined);
});
