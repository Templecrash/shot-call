'use client';
import {useEffect,useRef,useState} from 'react';
import {Download,Copy,Loader2,RefreshCw} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Switch} from '@/components/ui/switch';
import {PnlCard,pnlCardPng} from './pnl-card';
import type {PnlCardData} from '@/lib/pnl-card';

export function PnlShareDialog({kind,orderId,onClose}:{kind:'trade'|'portfolio';orderId?:string;onClose:()=>void}){
  const [hidden,setHidden]=useState(false),[data,setData]=useState<{card:PnlCardData;fingerprint:string}|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[path,setPath]=useState(''),[copied,setCopied]=useState(false);
  const cached=useRef<{fingerprint:string;blob:Blob}|null>(null);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setData(null);setPath('');setCopied(false);setError('');
    const query=new URLSearchParams({kind,hideAmounts:String(hidden),...(orderId?{orderId}:{})});
    fetch(`/api/pnl?${query}`,{signal:controller.signal}).then(async r=>{const result=await r.json() as {card:PnlCardData;fingerprint:string;error?:string};if(!r.ok)throw new Error(result.error||'Could not load P&L.');if(!controller.signal.aborted)setData(result);})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[kind,orderId,hidden,retry]);
  async function image(){
    if(!data)throw new Error('Wait for your P&L card to load.');
    if(cached.current?.fingerprint===data.fingerprint)return cached.current.blob;
    const blob=await pnlCardPng(data.card);cached.current={fingerprint:data.fingerprint,blob};return blob;
  }
  async function download(){
    setBusy(true);setError('');try{const url=URL.createObjectURL(await image());const a=document.createElement('a');a.href=url;a.download=`shot-call-pnl-${orderId||'portfolio'}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  async function copy(){
    if(!data)return;setBusy(true);setError('');setCopied(false);
    try{
      let sharePath=path;
      if(!sharePath){
        const query=new URLSearchParams({kind,orderId:orderId||'',hideAmounts:String(hidden),asOf:String(data.card.asOf),fingerprint:data.fingerprint});
        const r=await fetch(`/api/pnl?${query}`,{method:'POST',headers:{'Content-Type':'image/png'},body:await image()});
        if(!r.headers.get('content-type')?.includes('application/json'))throw new Error('Could not create the share link. Please retry.');
        const result=await r.json() as {path:string;error?:string};if(!r.ok)throw new Error(result.error||'Could not create the share link.');sharePath=result.path;setPath(sharePath);
      }
      await navigator.clipboard.writeText(new URL(sharePath,window.location.origin).href);setCopied(true);
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  }
  return <Dialog open onOpenChange={open=>{if(!open&&!busy)onClose();}}><DialogContent className="app-dialog pnl-share-dialog"><DialogTitle>Share P&amp;L</DialogTitle><DialogDescription>A card of your {kind==='portfolio'?'overall performance':'trade performance'}, captured at this moment.</DialogDescription>
    {loading?<div className="pnl-card-loading" role="status"><Loader2 className="spin" size={20}/> Preparing your P&L…</div>:data&&<PnlCard card={data.card}/>}
    <div className="pnl-share-options"><label htmlFor="pnl-hide-amounts">Hide dollar amounts</label><Switch id="pnl-hide-amounts" checked={hidden} onCheckedChange={setHidden} disabled={busy}/><button className="text-button" disabled={busy||loading} onClick={()=>setRetry(n=>n+1)}><RefreshCw size={14}/> Refresh</button></div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="pnl-share-actions"><button className="dark" disabled={busy||loading||!data} onClick={()=>void download()}><Download size={16}/> Download PNG</button><button className="outline" disabled={busy||loading||!data} onClick={()=>void copy()}>{busy?<Loader2 size={16} className="spin"/>:<Copy size={16}/>} {copied?'Link copied':'Copy share link'}</button></div>
    {path&&<input className="pnl-share-url" aria-label="P&L share link" readOnly value={typeof window!=='undefined'?new URL(path,window.location.origin).href:path}/>}
    <p className="small-muted">The link shares this dated demo P&L card and call title. Private call details stay private.</p>
  </DialogContent></Dialog>;
}
