'use client';
import {useRef,useState,useEffect} from 'react';
import {Sparkles,Plus,X,Check,Flag,Loader2} from 'lucide-react';
import {TokenIconImage} from './token-icon';
import {useTokenCatalog} from './token-catalog';
function Coin({symbol}:{symbol:string}){const catalog=useTokenCatalog(),token=catalog[symbol]||tokenFor(undefined,symbol);return <span className="coin-icon" style={{background:token.color}}><TokenIconImage symbol={symbol} token={token}/></span>}
import {creatorFor} from '@/lib/creators';
import {tokenFor} from '@/lib/token-catalog';
import {defaultExitPlan,validateExitPlan,type ExitPlan,type ExitState} from '@/lib/exit-plan';
import type {Thesis} from '@/lib/data';

export function ExitPlanSummary({thesis,plan=thesis.exitPlan,snapshot,onEdit,onAdopt,compact=false,sidebar=false}:{thesis:Thesis;plan?:ExitPlan|null;snapshot?:ExitState|null;onEdit?:()=>void;onAdopt?:()=>void;compact?:boolean;sidebar?:boolean}){
 const creator=creatorFor(thesis),groups=plan?.mode==='basket'?[null]:thesis.allocations.filter(a=>a.weight>0).map(a=>a.symbol);
 return <section className={`creator-exit-plan ${compact?'compact':''} ${sidebar?'sidebar':''}`} aria-label={sidebar?'Profit targets':'Creator exit strategy'}>
  <div className="exit-plan-heading">
   <div><span className="eyebrow"><Flag size={12}/> Creator’s exit plan</span><h3>{sidebar?'Profit targets':plan?(plan.mode==='basket'?'Exit the basket':'Token-by-token exits'):'Targets not set'}</h3></div>
   {onEdit&&<button className="outline" onClick={onEdit}>{plan?'Edit exits':'Set exits'}</button>}
  </div>
  <p className="exit-plan-author">Set by {creator.handle?'@'+creator.handle:creator.name}{snapshot?' · Saved with your investment':''}</p>
  {plan?<>
   {sidebar&&<p className="exit-plan-scope">{plan.mode==='basket'?'Whole basket':'Token-by-token targets'}</p>}
   <div className="exit-plan-targets">{groups?.map(symbol=><div className="exit-plan-target" key={symbol||'basket'}>
    {symbol&&<span className="exit-token"><Coin symbol={symbol}/><b>{tokenFor(thesis,symbol).symbol}</b></span>}
    <div>{plan.steps.map((s,i)=>s.symbol===symbol&&<span className={snapshot?.done.includes(i)?'exit-stage completed':'exit-stage'} key={i}>{snapshot?.done.includes(i)&&<Check size={12}/>}<b>+{s.targetPct}%</b><small>sell {s.sellPct}%</small></span>)}</div>
   </div>)}</div>
   {plan.stopLossPct!=null&&plan.stopLossPct>0&&<div className="published-stop-loss"><span>Basket stop loss</span><b>−{plan.stopLossPct}% · Sell remaining position</b></div>}
   {plan.rationale&&<p className="exit-plan-rationale">{plan.rationale}</p>}
   <p className="exit-plan-note">Targets use return on invested capital, before exit fees. Perp targets include leverage. Stages sell a share of the original {plan.mode==='basket'?'basket':'token holding'}. Short targets benefit from price declines.</p>
   {onAdopt&&<button className="outline wide" onClick={onAdopt}>Use this plan for my position</button>}
  </>:<p className="exit-plan-note">The creator hasn’t published take-profit targets yet. Investors can sell manually.</p>}
 </section>;
}

export function ExitPlanEditor({thesis,value,onChange,signedIn,onBusy}:{thesis:Thesis;value?:ExitPlan|null;onChange:(plan:ExitPlan|undefined)=>void;signedIn:boolean;onBusy?:(busy:boolean)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const request=useRef<{id:string;hash:string}|null>(null);
 const mode=value?.mode||'basket';
 const latest=useRef({thesis,mode});useEffect(()=>{latest.current={thesis,mode};},[thesis,mode]);
 const groups=mode==='basket'?[null]:thesis.allocations.filter(a=>a.weight>0).map(a=>a.symbol);
 const stageNumber=(symbol:string|null,i:number)=>value?.steps.slice(0,i+1).filter(s=>s.symbol===symbol).length||1;
 const update=(next:ExitPlan)=>{onChange({...next,origin:'creator',id:crypto.randomUUID(),updatedAt:Date.now()});setError('');request.current=null;};
 function schedule(staged:boolean){const base=value||defaultExitPlan(thesis,mode);update({...base,steps:groups.flatMap(symbol=>staged?[{symbol,targetPct:20,sellPct:25},{symbol,targetPct:40,sellPct:25},{symbol,targetPct:70,sellPct:50}]:[{symbol,targetPct:30,sellPct:100}])});}
 async function suggest(){
  setBusy(true);onBusy?.(true);setError('');
  const hash=JSON.stringify([thesis.title,thesis.body,thesis.allocations,mode]);
  const recovering=request.current?.hash===hash;
  const id=recovering?request.current!.id:crypto.randomUUID();request.current={id,hash};
  try{
   const response=await fetch(recovering?`/api/exit-strategy?id=${id}`:'/api/exit-strategy',recovering?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,title:thesis.title,body:thesis.body,allocations:thesis.allocations,mode})});
   const data=await response.json() as {plan?:ExitPlan;error?:string;pending?:boolean};
   if(!response.ok||!data.plan){if(!data.pending)request.current=null;throw new Error(data.error||'The suggestion is still finishing. Check again shortly.');}
   const current=latest.current;
   if(JSON.stringify([current.thesis.title,current.thesis.body,current.thesis.allocations,current.mode])!==hash){request.current=null;throw new Error('Your take changed while the suggestion was being prepared. Request a new suggestion for this version.');}
   onChange(validateExitPlan(data.plan,current.thesis));request.current=null;
  }catch(e){setError(e instanceof Error?e.message:'The suggestion could not finish. Your manual targets are still here.');}
  finally{setBusy(false);onBusy?.(false);}
 }
 let validation='';if(value)try{validateExitPlan(value,thesis);}catch(e){validation=e instanceof Error?e.message:'Check your targets.';}
 return <section className="exit-editor" aria-label="Set creator exit strategy"><div className="exit-plan-heading"><h3>Your exit strategy</h3><button className="outline exit-ai-button" type="button" onClick={suggest} disabled={busy||!signedIn||thesis.body.length<8}>{busy?<Loader2 size={14} className="spin"/>:<Sparkles size={14}/>} {busy?'Suggesting…':'Suggest exit strategy'}</button></div><p className="exit-plan-note">Publish the targets your investors will see. AI suggestions fill this draft for you to review.</p><label className="exit-enable"><input type="checkbox" checked={!!value} disabled={busy} onChange={e=>onChange(e.target.checked?defaultExitPlan(thesis):undefined)}/> Set take-profit & stop-loss rules</label>{value&&<><div className="exit-mode"><button type="button" className={mode==='basket'?'selected':''} disabled={busy} onClick={()=>mode!=='basket'&&update({...defaultExitPlan(thesis,'basket'),stopLossPct:value.stopLossPct,rationale:value.rationale})}>Whole basket</button><button type="button" className={mode==='tokens'?'selected':''} disabled={busy} onClick={()=>mode!=='tokens'&&update({...defaultExitPlan(thesis,'tokens'),stopLossPct:value.stopLossPct,rationale:value.rationale})}>Per token</button></div><div className="exit-schedule-choice"><button className="text-button" type="button" disabled={busy} onClick={()=>schedule(false)}>Sell all at a target</button><button className="text-button" type="button" disabled={busy} onClick={()=>schedule(true)}>Sell progressively</button></div>{groups.map(symbol=><fieldset className="exit-group" key={symbol||'basket'}><legend>{symbol?<><Coin symbol={symbol}/>{tokenFor(thesis,symbol).symbol}</>:'Basket profit'}</legend><div className="exit-stage-labels"><span>Profit target</span><span>Sell % of original</span></div>{value.steps.map((s,i)=>s.symbol===symbol&&<div className="exit-stage-inputs" key={i}><label><span>+</span><input type="number" min={1} max={1000} step="0.1" value={s.targetPct} disabled={busy} aria-label={`${symbol||'Basket'} stage ${stageNumber(symbol,i)} profit target`} onChange={e=>update({...value,steps:value.steps.map((row,j)=>j===i?{...row,targetPct:Number(e.target.value)}:row)})}/><span>%</span></label><label><input type="number" min={1} max={100} value={s.sellPct} disabled={busy} aria-label={`${symbol||'Basket'} stage ${stageNumber(symbol,i)} sell percent`} onChange={e=>update({...value,steps:value.steps.map((row,j)=>j===i?{...row,sellPct:Number(e.target.value)}:row)})}/><span>%</span></label><button type="button" disabled={busy||value.steps.filter(s=>s.symbol===symbol).length===1} aria-label={`Remove ${symbol||'basket'} exit stage ${stageNumber(symbol,i)}`} onClick={()=>update({...value,steps:value.steps.filter((_,j)=>j!==i)})}><X size={14}/></button></div>)}{value.steps.filter(s=>s.symbol===symbol).length<4&&<button className="text-button" type="button" disabled={busy} onClick={()=>{const last=value.steps.filter(s=>s.symbol===symbol).at(-1);update({...value,steps:[...value.steps,{symbol,targetPct:Math.min(1000,(last?.targetPct||0)+20),sellPct:25}]});}}><Plus size={13}/> Add stage</button>}<small>Sell total: {value.steps.filter(s=>s.symbol===symbol).reduce((n,s)=>n+s.sellPct,0)}% / 100%</small></fieldset>)}<label className="creator-stop-loss">Basket stop loss <span><input type="number" min={1} max={99} placeholder="Not set" aria-label="Creator basket stop loss percent" value={value.stopLossPct??''} disabled={busy} onChange={e=>update({...value,stopLossPct:e.target.value===''?null:Number(e.target.value)})}/> % loss</span><small>Closes the remaining basket when its loss reaches this level. Applies to spot and perp equity together.</small></label><label className="field-label">Why these exits?<textarea value={value.rationale} maxLength={1200} rows={3} disabled={busy} onChange={e=>update({...value,rationale:e.target.value})} placeholder="What would make your thesis play out, and when will you take profit?"/></label>{value.origin==='ai'&&<p className="exit-ai-review"><Sparkles size={13}/> AI draft · Review and edit before saving</p>}<p className="exit-plan-note">Targets use profit percentages from entry. All stages must total 100%. Each stage runs once. In this version, exits are evaluated on simulated market moves; spot and perp legs follow their saved targets. Liquidation can happen before a stop executes.</p></>}{(error||validation)&&<p className="form-error" role="alert">{error||validation}</p>}</section>;
}
