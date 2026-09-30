import type {Thesis} from './data';
import {tokenFor} from './token-catalog';

export {HORMUZ_MARKET} from './hormuz-market';
export function externalStrategy(thesis:Thesis):boolean {
  return !!thesis.counter || thesis.allocations.some(a=>a.weight>0&&(a.side==='short'||tokenFor(thesis,a.symbol).instrument==='prediction'));
}
export function basketUnit(thesis:Thesis):string {
  const unit=thesis.allocations.some(a=>tokenFor(thesis,a.symbol).instrument)?'instrument':'token';
  return unit+(thesis.allocations.length===1?'':'s');
}
export function positionDirection(thesis:Thesis,symbol:string):string {
  const short=thesis.allocations.find(a=>a.symbol===symbol)?.side==='short';
  return tokenFor(thesis,symbol).instrument==='prediction'?(short?'NO':'YES'):short?'SHORT':symbol!=='USDC'&&(thesis.counter||tokenFor(thesis,symbol).instrument==='stock')?'LONG':'';
}
export function allocationLabel(thesis:Thesis,symbol:string):string {
  const direction=positionDirection(thesis,symbol),label=tokenFor(thesis,symbol).symbol;
  return tokenFor(thesis,symbol).instrument==='prediction'?direction:direction?`${direction} ${label}`:label;
}
// Token shorts and counter baskets use signed underlying-price moves.
// Stock legs also move; cash and event shares stay fixed.
export function stockScenarioPct(thesis:Thesis,change:number):number {
  if(!Number.isFinite(change)||change<-90||change>100)throw new Error('Invalid directed scenario.');
  return thesis.allocations.reduce((sum,a)=>a.symbol!=='USDC'&&tokenFor(thesis,a.symbol).instrument!=='prediction'&&(thesis.counter||a.side==='short'||tokenFor(thesis,a.symbol).instrument==='stock')?sum+a.weight/100*change*(a.side==='short'?-1:1):sum,0);
}
