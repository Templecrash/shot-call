'use client';
import {Zap} from 'lucide-react';
import type {Allocation,Thesis} from '@/lib/data';
import {perpMarketFor} from '@/lib/perps';
import {tokenFor} from '@/lib/token-catalog';
import {usePerpAvailability} from './perp-availability';
export function CreatorExecution({thesis,allocation,onChange}:{thesis:Thesis;allocation:Allocation;onChange:(next:Allocation)=>void}){
 const snapshot=usePerpAvailability(),token=tokenFor(thesis,allocation.symbol),market=snapshot?perpMarketFor(thesis,allocation.symbol,snapshot.markets):undefined;
 if(token.instrument)return null;
 const perp=allocation.execution==='perps',max=market?Math.min(10,market.maxLeverage):allocation.leverage||1;
 return <div className="creator-execution" aria-label={`${token.symbol} execution`}><div className="creator-execution-modes"><button type="button" aria-pressed={!perp} disabled={!!thesis.counter?.generationId&&allocation.side==='short'} onClick={()=>onChange({...allocation,execution:'spot',leverage:1,side:thesis.counter?allocation.side:'long'})}>Spot</button><button type="button" className="perps-mode" aria-pressed={perp} disabled={!market} onClick={()=>onChange({...allocation,execution:'perps',leverage:Math.min(3,max)})}><Zap size={12}/> Perp</button></div>{perp?<><label>Direction<select aria-label={`${token.symbol} perp direction`} disabled={!!thesis.counter} value={allocation.side||'long'} onChange={e=>onChange({...allocation,side:e.target.value as 'long'|'short'})}><option value="long">Long</option><option value="short">Short</option></select></label><label>Leverage<select aria-label={`${token.symbol} creator leverage`} value={allocation.leverage||1} disabled={!market} onChange={e=>onChange({...allocation,leverage:Number(e.target.value)})}>{Array.from({length:max},(_,i)=><option value={i+1} key={i}>{i+1}×</option>)}</select></label><small>{market?'Hyperliquid · Isolated margin':thesis.counter?'Selected perp unavailable · Recheck or remove':'Selected perp unavailable · Choose spot or retry'}</small></>:<small>{market?'Perp available on Hyperliquid':snapshot?'No verified perp market':'Checking perp availability…'}</small>}</div>;
}
