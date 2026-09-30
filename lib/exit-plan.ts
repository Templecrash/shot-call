import {z} from 'zod';
import type {Thesis} from './data';

export const exitPlanSchema=z.object({
 stopLossPct:z.number().min(1).max(99).nullable().optional(),id:z.string().min(1).max(80),mode:z.enum(['basket','tokens']),
 steps:z.array(z.object({symbol:z.string().min(1).max(110).nullable(),targetPct:z.number().min(1).max(1000),sellPct:z.number().int().min(1).max(100)})).min(1).max(40),
 rationale:z.string().trim().max(1200),origin:z.enum(['creator','ai']),updatedAt:z.number().int().nonnegative(),
});
export type ExitPlan=z.infer<typeof exitPlanSchema>;
export type ExitState={plan:ExitPlan;done:number[];legs:{symbol:string;amount:number;cost:number}[]};
export function validateExitPlan(value:unknown,thesis:Pick<Thesis,'allocations'>):ExitPlan{
 const plan=exitPlanSchema.parse(value),symbols=thesis.allocations.filter(a=>a.weight>0).map(a=>a.symbol);
 const groups=plan.mode==='basket'?[null]:symbols;
 if(plan.steps.some(s=>!groups.includes(s.symbol as never)))throw new Error('Exit targets must belong to this basket.');
 for(const symbol of groups){
  const steps=plan.steps.filter(s=>s.symbol===symbol);
  if(!steps.length||steps.length>4||steps.reduce((n,s)=>n+s.sellPct,0)!==100)throw new Error('Each exit schedule needs 1–4 stages selling a total of 100%.');
  if(steps.some((s,i)=>i>0&&s.targetPct<=steps[i-1].targetPct))throw new Error('Targets must increase at each stage.');
 }
 return plan;
}
export function splitCents(total:number,weights:number[]){
 const sum=weights.reduce((s,w)=>s+w,0);if(!sum)return weights.map(()=>0);
 const rows=weights.map((w,i)=>({i,n:Math.floor(total*w/sum),r:total*w%sum}));
 let left=total-rows.reduce((s,r)=>s+r.n,0);
 for(const r of [...rows].sort((a,b)=>b.r-a.r||a.i-b.i)){if(!left)break;r.n++;left--;}
 return rows.map(r=>r.n);
}
export function startExitState(plan:ExitPlan,thesis:Pick<Thesis,'allocations'>,amount:number,cost:number):ExitState{
 const allocations=thesis.allocations.filter(a=>a.weight>0),weights=allocations.map(a=>a.weight);
 const amounts=splitCents(amount,weights),costs=splitCents(cost,weights);
 return {plan,done:[],legs:allocations.map((a,i)=>({symbol:a.symbol,amount:amounts[i],cost:costs[i]}))};
}
export function readExitState(raw:string|null|undefined):ExitState|null{return raw?JSON.parse(raw) as ExitState:null;}
export function scaleExitState(state:ExitState,amount:number,cost:number):ExitState{
 const amounts=splitCents(amount,state.legs.map(l=>l.amount)),costs=splitCents(cost,state.legs.map(l=>l.cost));
 return {...state,legs:state.legs.map((l,i)=>({...l,amount:amounts[i],cost:costs[i]}))};
}
export function markExitState(state:ExitState,thesis:Pick<Thesis,'allocations'>,change:number,basketValue?:number):ExitState{
 let legs=state.legs.map(l=>({...l,amount:Math.max(0,Math.round(l.amount*(1+(l.symbol==='USDC'?0:change*(thesis.allocations.find(a=>a.symbol===l.symbol)?.side==='short'?-1:1))/100)))}));
 if(basketValue!==undefined){const amounts=splitCents(basketValue,legs.map(l=>l.amount));legs=legs.map((l,i)=>({...l,amount:amounts[i]}));}
 return {...state,legs};
}
// Percentages sell a share of the original holding, so 25/25/50 closes it fully.
// Completed stages remain consumed even if prices later fall and recover.
export function evaluateExitState(state:ExitState,thesis:Pick<Thesis,'allocations'>,change:number,basketValue?:number){
 return evaluateMarkedExits(markExitState(state,thesis,change,basketValue));
}
export function evaluateMarkedExits(state:ExitState,stopCost?:number){
 const legs=state.legs.map(l=>({...l}));
 const markedValue=legs.reduce((s,l)=>s+l.amount,0),markedCost=legs.reduce((s,l)=>s+l.cost,0);
 const done=[...state.done];let proceeds=0,releasedCost=0;
 if(state.plan.stopLossPct&&markedValue*100<=(stopCost??markedCost)*(100-state.plan.stopLossPct))return {state:{...state,legs:legs.map(l=>({...l,amount:0,cost:0}))},markedValue,markedCost,proceeds:markedValue,releasedCost:markedCost,amount:0,cost:0,stopped:true};
 state.plan.steps.forEach((step,i)=>{
  if(done.includes(i))return;
  const group=step.symbol===null?legs:legs.filter(l=>l.symbol===step.symbol),value=group.reduce((s,l)=>s+l.amount,0),cost=group.reduce((s,l)=>s+l.cost,0);
  if(!cost||value*100<cost*(100+step.targetPct))return;
  const sold=state.plan.steps.reduce((n,s,j)=>n+(s.symbol===step.symbol&&done.includes(j)?s.sellPct:0),0),fraction=step.sellPct/(100-sold);
  for(const l of group){const sale=fraction>=1?l.amount:Math.round(l.amount*fraction),basis=fraction>=1?l.cost:Math.round(l.cost*fraction);l.amount-=sale;l.cost-=basis;proceeds+=sale;releasedCost+=basis;}
  done.push(i);
 });
 return {stopped:false,state:{...state,legs,done},markedValue,markedCost,proceeds,releasedCost,amount:legs.reduce((s,l)=>s+l.amount,0),cost:legs.reduce((s,l)=>s+l.cost,0)};
}
export function defaultExitPlan(thesis:Pick<Thesis,'allocations'>,mode:ExitPlan['mode']='basket'):ExitPlan{
 return {id:crypto.randomUUID(),mode,steps:(mode==='basket'?[null]:thesis.allocations.filter(a=>a.weight>0).map(a=>a.symbol)).map(symbol=>({symbol,targetPct:30,sellPct:100})),rationale:'',origin:'creator',updatedAt:Date.now()};
}
