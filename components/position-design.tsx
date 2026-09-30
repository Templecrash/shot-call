'use client';
import {readExecutionState} from '@/lib/creator-execution';
import {useEffect,useId,useRef,useState,type ReactNode} from 'react';
import {ArrowLeftRight,Layers,Loader2,ShieldCheck,Zap} from 'lucide-react';
import {dollars,type Allocation,type Position,type Thesis} from '@/lib/data';
import {assessPosition,exposureGroups,positionExecution,SHARED_CASH,type ExecutionPreview,type ExposureGroup} from '@/lib/position-design';
import {creatorPerpCoverage} from '@/lib/perps';
import {assessHedge,hedgeInputError,readHedgeSnapshot,type HedgeAssessment} from '@/lib/hedge-assessment';
import {allocationLabel} from '@/lib/external-strategy';
import {tokenFor} from '@/lib/token-catalog';
import {tokenFit} from '@/lib/research';
import {readExitState} from '@/lib/exit-plan';
import {polymarketFor} from '@/lib/polymarket';
import {usePerpAvailability} from './perp-availability';
import {TokenIconImage} from './token-icon';
import {TokenNetwork} from './token-network';
import {PolymarketInstrument} from './polymarket-instrument';
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow} from './ui/table';

function Coin({thesis,symbol}:{thesis:Thesis;symbol:string}){
  const token=tokenFor(thesis,symbol);
  return <span className="coin-icon" style={{background:token.color}}><TokenIconImage token={token} symbol={symbol}/></span>;
}
export function ExposureBreakdown({thesis,execution,renderRows,compact=false}:{thesis:Thesis;execution?:ExecutionPreview;renderRows:(rows:Allocation[],group:ExposureGroup)=>ReactNode;compact?:boolean}){
  return <div className={`exposure-groups${compact?' compact-exposure':''}`}>{exposureGroups(thesis,execution).map(group=><section className={`exposure-group exposure-${group.kind}`} key={group.kind} aria-label={`${group.title} exposure`}><header><h3>{group.kind==='perps'?<Zap size={15}/>:group.kind==='prediction'?<img src="/coins/polymarket.png" alt="" width={17} height={17}/>:<Layers size={15}/>} {group.title}</h3><span>{group.weight}% {execution?.mode==='perps'?'of collateral':'allocated'}</span></header><p className="exposure-explainer">{group.description}</p>{renderRows(group.allocations,group)}</section>)}</div>;
}

export function TakeExposure({thesis,position,onToken}:{thesis:Thesis;position?:Position;onToken:(symbol:string)=>void}){
  const execution=positionExecution(position),exits=readExitState(position?.exitState),frozen=readExecutionState(position?.executionState);
  return <ExposureBreakdown thesis={thesis} execution={execution} renderRows={(rows,group)=><Table className="token-table"><TableHeader><TableRow><TableHead>{group.kind==='prediction'?'Market':group.kind==='perps'?'Contract':group.kind==='collateral'?'Allocation source':'Asset'}</TableHead><TableHead>Thesis fit</TableHead><TableHead className="align-right">{execution?'Margin weight':'Weight'}</TableHead><TableHead className="align-right">{group.kind==='perps'?'Notional':group.kind==='collateral'?'Cash':position?'Value':'Per $1,000'}</TableHead></TableRow></TableHeader><TableBody>{rows.map(a=>{
    const token=tokenFor(thesis,a.symbol),fit=tokenFit(thesis,a.symbol);
    const leg=frozen?.legs.find(l=>l.symbol===a.symbol);
    const value=leg?(group.kind==='perps'?leg.notional:leg.amount):group.kind==='perps'&&!position?100000*a.weight*(a.leverage||1)/100:group.kind==='perps'?(position?.perpNotional||0)*a.weight/(position?.perpWeight||1):position?(exits?.legs.find(l=>l.symbol===a.symbol)?.amount??position.amount*a.weight/100):100000*a.weight/100;
    return <TableRow key={a.symbol} className={group.kind==='prediction'?'polymarket-row':undefined}><TableCell>{group.kind==='collateral'?<span className="cash-allocation"><b>{a.symbol===SHARED_CASH?'Shared cash collateral':`Cash · ${token.symbol} weight`}</b><small>{a.symbol===SHARED_CASH?'No underlying token holding':`No ${token.symbol} position`}</small></span>:polymarketFor(thesis,a.symbol)?<PolymarketInstrument thesis={thesis} symbol={a.symbol}/>:<button className="token-name" onClick={()=>onToken(a.symbol)} aria-label={`Assess ${token.name}`}><Coin thesis={thesis} symbol={a.symbol}/><span><b>{token.name}</b><small>{group.kind==='perps'?`${token.symbol} · ${(a.side||'long').toUpperCase()} ${a.leverage||position?.leverage||1}× perp`:allocationLabel(thesis,a.symbol)}<span className="mobile-token-fit"> · {fit.kind}</span></small>{group.kind==='perps'?<span className="token-network"><Zap size={12}/> Hyperliquid</span>:<TokenNetwork token={token}/>}</span></button>}</TableCell><TableCell>{group.kind==='collateral'?<small className="fit-detail">Supports shared margin</small>:<><span className={`fit exposure-tag ${fit.kind.toLowerCase()}`}>{fit.kind}</span><small className="fit-detail">{fit.label}</small></>}</TableCell><TableCell className="align-right">{a.weight}%</TableCell><TableCell className="align-right">{dollars(value)}</TableCell></TableRow>;
  })}</TableBody></Table>}/>;
}

export function OrderExposure({thesis,capital,salePosition}:{thesis:Thesis;capital:number;salePosition?:Position}){
  const execution=positionExecution(salePosition),frozen=readExecutionState(salePosition?.executionState);
  const fraction=salePosition?.amount?Math.max(0,capital)/salePosition.amount:1;
  return <ExposureBreakdown compact thesis={thesis} execution={execution} renderRows={(rows,group)=><div className="order-details">{rows.map(a=>{
    const leg=frozen?.legs.find(l=>l.symbol===a.symbol);
    const value=leg?(group.kind==='perps'?leg.notional:leg.amount)*fraction:salePosition&&group.kind==='perps'?(salePosition.perpNotional||0)*fraction*a.weight/(salePosition.perpWeight||1):Math.max(0,capital)*a.weight/100*(group.kind==='perps'?a.leverage||1:1);
    return <div key={a.symbol}><span>{group.kind==='collateral'?(a.symbol===SHARED_CASH?'Shared cash collateral':`Cash · ${tokenFor(thesis,a.symbol).symbol} weight`):<><Coin thesis={thesis} symbol={a.symbol}/>{tokenFor(thesis,a.symbol).symbol}{group.kind==='perps'?` · ${(a.side||'long').toUpperCase()} ${a.leverage||salePosition?.leverage||1}×`:a.side==='short'?' · SHORT':''}</>} · {a.weight}%</span><b>{dollars(value)}{group.kind==='perps'&&<small> notional</small>}</b></div>;
  })}</div>}/>;
}

export function PositionDesign({thesis,budget=100000}:{thesis:Thesis;budget?:number}){
  const snapshot=usePerpAvailability(),id=useId();
  const coverage=snapshot?creatorPerpCoverage(thesis,snapshot.markets,snapshot.checkedAt):null;
  const assessment=assessPosition(thesis,coverage);
  const signature=JSON.stringify([thesis.id,thesis.body,thesis.allocations,thesis.tokens,budget]);
  const latest=useRef(signature);latest.current=signature;
  const request=useRef<AbortController|null>(null);
  const [run,setRun]=useState<{signature:string;busy:boolean;report?:HedgeAssessment}|null>(null);
  const busy=run?.signature===signature&&run.busy,report=run?.signature===signature?run.report:undefined;
  const inputError=hedgeInputError(thesis,budget);
  useEffect(()=>{
    setRun(null);
    return ()=>{request.current?.abort();};
  },[signature]);
  async function reviewHedge(){
    if(inputError||busy)return;
    request.current?.abort();const controller=new AbortController();request.current=controller;
    setRun({signature,busy:true});
    let markets=null;
    try{
      const response=await fetch('/api/perps/markets',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),cache:'no-store'});
      if(response.ok)markets=readHedgeSnapshot(await response.json());
    }catch{/* Unverified markets produce position-reduction guidance only. */}
    if(controller.signal.aborted||latest.current!==signature)return;
    setRun({signature,busy:false,report:assessHedge(thesis,budget,markets)});
  }
  return <section className="position-design" aria-label="Creator position assessment">
    <header><div><span className="eyebrow"><ArrowLeftRight size={12}/> Creator review</span><h3>How to express this call</h3></div><span className="assessment-badge">Updates with your basket</span></header>
    <div className="position-design-route"><b>{assessment.route}</b><p>{assessment.reason}</p></div>
    <div className="position-design-details">
      <div><h4><Zap size={13}/> Execution alternative</h4><p>{assessment.alternative}</p></div>
      <div className="hedge-action"><h4><ShieldCheck size={14}/> Hedge</h4><p>Assess ways to offset this basket’s exposure.</p><button type="button" className="outline" onClick={reviewHedge} disabled={busy||!!inputError} aria-expanded={!!report} aria-controls={id}>{busy?<Loader2 size={14} className="spin"/>:<ShieldCheck size={14}/>} {busy?'Assessing hedge…':report?'Reassess hedge':'Assess hedge'}</button>{inputError&&<p>{inputError}</p>}</div>
    </div>
    <div aria-live="polite">{run&&run.signature!==signature&&<p className="hedge-changed">Your setup changed. Assess the hedge again for this version.</p>}{busy&&<p>Checking matching markets and position sizes…</p>}</div>
    {report&&<section className="hedge-assessment" id={id} aria-label="Hedge assessment">
      <header><div><h4>Hedge assessment</h4><p>{report.summary}</p></div><button type="button" className="text-button" onClick={()=>setRun(null)}>Hide</button></header>
      <p className="hedge-basis">Based on your {dollars(report.budget)} preview budget. {report.checkedAt?`Market availability checked ${new Date(report.checkedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}.`:'Live market availability is unverified; no new derivative route is suggested.'}</p>
      {report.legs.some(leg=>leg.offset!==undefined)&&<p className="hedge-basis">Dollar amounts illustrate a 25% reduction in each asset’s exposure, not an optimized hedge size.</p>}
      <div className="hedge-options">{report.legs.map(leg=><article key={leg.key}>
        <header><Coin thesis={thesis} symbol={leg.key}/><div><b>{leg.symbol}</b><span>{dollars(leg.notional)} {tokenFor(thesis,leg.key).instrument==='prediction'?`${leg.direction==='short'?'NO':'YES'} stake`:`${leg.direction.toUpperCase()} exposure`}</span></div></header>
        <h4>{leg.title}</h4><p>{leg.reason}</p>
        {leg.offset!==undefined&&<dl><div><dt>{leg.collateral!==undefined?'Short notional at 1×':'Reduce exposure by'}</dt><dd>{dollars(leg.offset)}</dd></div><div><dt>Remaining {leg.symbol} exposure</dt><dd>{dollars(leg.remaining!)}</dd></div>{leg.collateral!==undefined&&<div><dt>Additional collateral</dt><dd>{dollars(leg.collateral)}</dd></div>}</dl>}
        {leg.marketUrl&&<a href={leg.marketUrl} target="_blank" rel="noreferrer">View exact market ↗</a>}
      </article>)}</div>
      <p className="hedge-basis">Review only · Your draft is unchanged. Separate hedge legs are not added automatically. Figures exclude fees, funding and slippage; residual and liquidation risk remain.</p>
      <div className="hedge-sources"><a href="https://hyperliquid.gitbook.io/hyperliquid-docs/trading/margining" target="_blank" rel="noreferrer">Margin & position sizing ↗</a><a href="https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding" target="_blank" rel="noreferrer">Funding ↗</a></div>
    </section>}
    <details className="assessment-review"><summary>Before publishing</summary><p>{assessment.review}</p><div>{assessment.sources.map(source=><a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</div></details>
  </section>;
}
