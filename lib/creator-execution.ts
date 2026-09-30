import {selectedFeeBps} from './performance-fees';
import type {Allocation,Thesis} from './data';
import {isStablecoin} from './allocations';
import {tokenFor} from './token-catalog';
import {splitCents,type ExitState} from './exit-plan';
import type {PerpCoverage} from './perps';

export type ExecutionLeg={symbol:string;weight:number;mode:'spot'|'perps';side:'long'|'short';leverage:number;kind:'spot'|'stable'|'prediction';amount:number;cost:number;notional:number;maintenanceBps:number;markPrice:number};
export type ExecutionState={version:1;configKey:string;legs:ExecutionLeg[]};
export const hasPerps=(thesis:Pick<Thesis,'allocations'>)=>thesis.allocations.some(a=>a.weight>0&&a.execution==='perps');
export function creatorConfigKey(thesis:Thesis){return JSON.stringify([thesis.version,thesis.allocations.map(a=>[a.symbol,a.weight,a.side||'long',a.execution||'spot',a.execution==='perps'?a.leverage||1:1]),thesis.exitPlan||null,selectedFeeBps(thesis)]);}
export function validateExecution(thesis:Thesis,coverage?:PerpCoverage|null){
 for(const a of thesis.allocations){
  const leverage=a.leverage??1;
  if(!Number.isInteger(leverage)||leverage<1||leverage>10)throw new Error('Choose leverage from 1× to 10×.');
  if(a.execution!=='perps'){if(leverage!==1)throw new Error('Spot positions must use 1× exposure.');continue;}
  if(!a.weight)continue;
  const leg=coverage?.legs.find(l=>l.key===a.symbol);
  if(!leg||leverage>Math.min(10,leg.maxLeverage))throw new Error(`The selected ${tokenFor(thesis,a.symbol).symbol} perp or leverage is unavailable. Choose a supported market before saving or investing.`);
 }
}
export function readExecutionState(raw:string|null|undefined):ExecutionState|null{return raw?JSON.parse(raw) as ExecutionState:null;}
export function startExecution(thesis:Thesis,amount:number,cost:number,coverage?:PerpCoverage|null):ExecutionState{
 const allocations=thesis.allocations.filter(a=>a.weight>0),values=splitCents(amount,allocations.map(a=>a.weight)),costs=splitCents(cost,allocations.map(a=>a.weight));
 return {version:1,configKey:creatorConfigKey(thesis),legs:allocations.map((a,i)=>{
  const market=coverage?.legs.find(l=>l.key===a.symbol),token=tokenFor(thesis,a.symbol),mode=a.execution||'spot',leverage=mode==='perps'?a.leverage||1:1;
  return {symbol:a.symbol,weight:a.weight,mode,side:a.side||'long',leverage,kind:token.instrument==='prediction'?'prediction':isStablecoin(token.symbol)?'stable':'spot',amount:values[i],cost:costs[i],notional:mode==='perps'?values[i]*leverage:0,maintenanceBps:mode==='perps'?market!.maintenanceBps:0,markPrice:mode==='perps'?market!.markPrice:0};
 })};
}
export function addExecution(state:ExecutionState,addition:ExecutionState):ExecutionState{
 return {...state,legs:state.legs.map(l=>{const added=addition.legs.find(a=>a.symbol===l.symbol)!;return {...l,amount:l.amount+added.amount,cost:l.cost+added.cost,notional:l.notional+added.notional};})};
}
export function executionTotals(state:ExecutionState){return {amount:state.legs.reduce((n,l)=>n+l.amount,0),cost:state.legs.reduce((n,l)=>n+l.cost,0),notional:state.legs.reduce((n,l)=>n+l.notional,0)};}
export function scaleExecution(state:ExecutionState,amount:number,cost:number):ExecutionState{
 const values=splitCents(amount,state.legs.map(l=>l.amount)),costs=splitCents(cost,state.legs.map(l=>l.cost));
 return {...state,legs:state.legs.map((l,i)=>({...l,amount:values[i],cost:costs[i],notional:l.amount?Math.round(l.notional*values[i]/l.amount):0}))};
}
export function alignExecutionExits(state:ExecutionState,exits:ExitState):ExecutionState{
 return {...state,legs:state.legs.map(l=>{const remaining=exits.legs.find(e=>e.symbol===l.symbol)!;return {...l,amount:remaining.amount,cost:remaining.cost,notional:l.amount?Math.round(l.notional*remaining.amount/l.amount):0};})};
}
// Each perp has isolated collateral. A liquidated leg realizes its own cost;
// other legs keep their equity and cannot be charged for that loss.
export function markExecution(state:ExecutionState,change:number){
 let releasedCost=0,liquidated=false;
 const legs=state.legs.map(l=>{
  if(!l.amount)return {...l};
  const direction=l.side==='short'?-1:1;
  if(l.mode!=='perps'){const amount=l.kind==='spot'?Math.max(0,Math.round(l.amount*(1+direction*change/100))):l.amount;if(!amount){releasedCost+=l.cost;return {...l,amount:0,cost:0};}return {...l,amount};}
  const notional=Math.max(0,Math.round(l.notional*(1+change/100))),amount=Math.max(0,l.amount+Math.round(l.notional*direction*change/100)),markPrice=l.markPrice*(1+change/100);
  if(amount<=Math.ceil(notional*l.maintenanceBps/10000)){releasedCost+=l.cost;liquidated=true;return {...l,amount:0,cost:0,notional:0,markPrice};}
  return {...l,amount,notional,markPrice};
 });
 return {state:{...state,legs},releasedCost,liquidated};
}
export function legLiquidationPrice(leg:ExecutionLeg){
 if(leg.mode!=='perps'||!leg.notional||!leg.markPrice)return null;
 const ratio=leg.amount/leg.notional,maintenance=leg.maintenanceBps/10000;
 const move=leg.side==='short'?(ratio-maintenance)/(1+maintenance):(maintenance-ratio)/(1-maintenance);
 return Math.max(0,leg.markPrice*(1+move));
}
export function executionAllocations(state:ExecutionState):Allocation[]{return state.legs.map(l=>({symbol:l.symbol,weight:l.weight,side:l.side,execution:l.mode,leverage:l.leverage}));}
