'use client';
import { ArrowLeftRight, ArrowUpRight, Sparkles, Loader2 } from 'lucide-react';
import type { Thesis } from '@/lib/data';
import {CounterAssets} from './counter-assets';
import {isStablecoin} from '@/lib/allocations';
import {tokenFor} from '@/lib/token-catalog';

export function CounterStrategyPanel({ thesis, onOpenOriginal }: {
  thesis: Thesis;
  onOpenOriginal: (id: string) => void;
}) {
  const counter = thesis.counter;
  if (!counter) return null;
  return <section className="counter-strategy-panel" aria-label="Counter strategy">
    <div className="counter-heading">
      <span className="counter-icon"><ArrowLeftRight size={20}/></span>
      <div><h2>Counter strategy</h2>
        <p>Opposing <button onClick={() => onOpenOriginal(counter.sourceId)}>{counter.sourceTitle} <ArrowUpRight size={13}/></button>.</p>
      </div>
      <span className="counter-badge">Counter strategy</span>
    </div>
    <p className="counter-explainer">Short legs benefit from a fall; long legs from a rise. Each position follows its published execution settings.</p>
    <CounterAssets thesis={thesis}/>
  </section>;
}


export function CountertradePrompt({thesis,onResearch,busy=false}:{
  thesis:Thesis;
  onResearch:()=>void;
  busy?:boolean;
}) {
  const hasExposure=thesis.allocations.some(a=>a.weight>0&&!isStablecoin(tokenFor(thesis,a.symbol).symbol));
  return <section className="countertrade-prompt" aria-labelledby="countertrade-heading">
    <div className="countertrade-prompt-heading"><span className="countertrade-prompt-icon"><ArrowLeftRight size={19} aria-hidden="true"/></span><h3 id="countertrade-heading">Countertrade this strategy</h3></div>
    <p>Think this call is wrong? Find available positions for the opposite side.</p>
    <button type="button" className="outline wide" disabled={busy||!hasExposure} onClick={onResearch}>
      {busy?<Loader2 size={16} className="spin" aria-hidden="true"/>:<Sparkles size={16} aria-hidden="true"/>}
      {busy?'Researching countertrade…':'Research opposite positions'}
    </button>
    <small>{hasExposure?'Checks shorts, spot longs and opposite market outcomes. Review the counter call before publishing.':'Cash-only strategies have no direct position to reverse.'}</small>
  </section>;
}
