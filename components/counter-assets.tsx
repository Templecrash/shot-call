'use client';
import {ExternalLink,RefreshCw} from 'lucide-react';
import type {Allocation,Thesis} from '@/lib/data';
import {tokenFor} from '@/lib/token-catalog';

export function CounterAssets({thesis,onAdd,onRetry,working=false}:{thesis:Thesis;onAdd?:(allocation:Allocation)=>void;onRetry?:()=>void;working?:boolean}){
  const plan=thesis.counter?.plan;
  if(!plan)return null;
  const selected=plan.routes.filter(r=>thesis.allocations.some(a=>a.symbol===r.allocation.symbol&&a.weight>0)),available=plan.routes.filter(r=>!thesis.allocations.some(a=>a.symbol===r.allocation.symbol));
  return <section className="counter-assets" aria-label="Generated counter assets">
    <div className="counter-assets-heading"><div><b>{thesis.allocations.length?'Your opposing positions':'No direct counter available'}</b><p>{plan.coveredWeight}% of the original basket has a supported opposite position.</p></div>{onRetry&&<button type="button" className="text-button" disabled={working} onClick={onRetry}><RefreshCw size={13}/> Recheck markets</button>}</div>
    {selected.map(route=><div className="counter-route" key={route.allocation.symbol}><span className={`counter-route-label ${route.kind}`}>{route.kind==='alternative'?'Broader alternative':route.kind==='outcome'?'Opposite outcome':'Direct counter'} · {route.kind==='outcome'?(route.allocation.side==='short'?'NO':'YES'):tokenFor(thesis,route.allocation.symbol).symbol}</span><p>{route.reason}</p>{route.question&&<p><b>{route.allocation.side==='short'?'NO':'YES'}</b> · {route.question} {route.price!==undefined&&<span>· {(route.price*100).toFixed(1)}¢ at generation</span>}</p>}<a href={route.source} target="_blank" rel="noreferrer">{route.kind==='outcome'?'Question & resolution rules':'Source'} <ExternalLink size={12}/></a></div>)}
    {plan.omitted.length>0&&<div className="counter-omissions"><b>Not included</b>{plan.omitted.map(item=><p key={item.symbol}><strong>{tokenFor(thesis,item.symbol).symbol}</strong> · {item.reason}</p>)}</div>}
    {onAdd&&available.length>0&&<div className="counter-alternatives"><b>{available.some(r=>r.kind==='alternative')?'Optional candidates':'Available positions'}</b>{available.some(r=>r.kind==='alternative')&&<p>Add a broader short only if your counterargument also expects weakness in gaming and NFT activity. These can rise even if the original gacha call fails.</p>}{available.map(route=><article key={route.allocation.symbol}>{tokenFor(thesis,route.allocation.symbol).image&&<img src={tokenFor(thesis,route.allocation.symbol).image} alt={`${tokenFor(thesis,route.allocation.symbol).symbol} icon`} width={28} height={28}/>}<div><b>{tokenFor(thesis,route.allocation.symbol).name}</b><span>{route.kind==='alternative'?'Broader alternative':'Direct counter'} · {route.allocation.side==='short'?'Short':'Long'}{route.allocation.execution==='perps'?' perp · 1×':''}</span><p>{route.reason}</p><a href={route.source} target="_blank" rel="noreferrer">Project source <ExternalLink size={12}/></a></div><button type="button" className="outline" disabled={working||thesis.allocations.length>=10} onClick={()=>onAdd(route.allocation)}>Add {tokenFor(thesis,route.allocation.symbol).symbol}</button></article>)}</div>}
    {plan.notes.map(note=><p className="counter-note" key={note}>{note}</p>)}
    <small>Markets checked {new Date(plan.checkedAt).toLocaleString()}. {onAdd?'Review the selected exposure and set exits before publishing.':'Availability can change after publication.'}</small>
  </section>;
}
