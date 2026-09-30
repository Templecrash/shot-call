'use client';
import {useEffect,useState} from 'react';
import {ExternalLink} from 'lucide-react';
import {polymarketFor,type PolymarketQuote} from '@/lib/polymarket';
import {positionDirection} from '@/lib/external-strategy';
import type {Thesis} from '@/lib/data';
import {TokenNetwork} from './token-network';
import {tokenFor} from '@/lib/token-catalog';

const cents=(value:number)=>value>0&&value<.001?'<0.1¢':value<1&&value>.999?'>99.9¢':`${Number((value*100).toFixed(1))}¢`;
export function PolymarketInstrument({thesis,symbol}:{thesis:Thesis;symbol:string}){
  const market=polymarketFor(thesis,symbol),side=positionDirection(thesis,symbol);
  const [quote,setQuote]=useState<PolymarketQuote|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    if(!market)return;
    let disposed=false,controller:AbortController|null=null;
    const refresh=async()=>{
      if(document.visibilityState==='hidden')return;
      controller?.abort();controller=new AbortController();
      try{
        const response=await fetch(`/api/polymarket?thesisId=${encodeURIComponent(thesis.id)}&symbol=${encodeURIComponent(symbol)}`,{signal:controller.signal,cache:'no-store'});
        const data=await response.json() as PolymarketQuote&{error?:string};
        if(!response.ok)throw new Error(data.error||'Market prices are unavailable.');
        if(!disposed){setQuote(data);setError('');}
      }catch(error){if(!disposed&&!(error instanceof DOMException&&error.name==='AbortError')){setQuote(null);setError('Prices unavailable');}}
    };
    void refresh();const timer=setInterval(()=>void refresh(),60000);
    const onVisible=()=>{if(document.visibilityState==='visible')void refresh();};
    document.addEventListener('visibilitychange',onVisible);
    return()=>{disposed=true;controller?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',onVisible);};
  },[market,thesis.id,symbol]);
  if(!market)return null;
  return <div className="polymarket-instrument">
    <button type="button" className="polymarket-identity" aria-label={`Assess ${market.question}`}><img src="/coins/polymarket.png" alt="Polymarket logo" width={28} height={28}/><b>Polymarket</b><span className="polymarket-held">{side} held</span></button>
    <a className="polymarket-question" href={market.url} target="_blank" rel="noopener noreferrer" onClick={event=>event.stopPropagation()}>{quote?.question||market.question}<ExternalLink size={12}/></a>
    <div className="polymarket-prices" aria-label="Polymarket outcome prices">
      {(['YES','NO'] as const).map(outcome=><span key={outcome} className={`polymarket-price ${outcome.toLowerCase()} ${side===outcome?'held':''}`}><small>{outcome}</small><strong>{quote?cents(outcome==='YES'?quote.yes:quote.no):'—'}</strong></span>)}
    </div>
    <small className="polymarket-updated">{error?error:quote?<>{quote.status==='open'?'Market prices':quote.status==='closed'?'Market closed · Last prices':'Trading paused · Last prices'} · <time dateTime={new Date(quote.fetchedAt).toISOString()} title={`Fetched ${new Date(quote.fetchedAt).toLocaleString()}`}>{new Date(quote.fetchedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time></>:'Loading market prices…'}</small>
    <div className="polymarket-meta"><TokenNetwork token={tokenFor(thesis,symbol)}/><small>Demo holding · External settlement</small></div>
  </div>;
}
