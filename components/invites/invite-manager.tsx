'use client';
import {useCallback,useEffect,useState} from 'react';
import {Ticket,Copy,Check,RefreshCw} from 'lucide-react';
import type {InviteState} from '@/lib/invites';
import {ProductDisclosure} from '@/components/product-disclosure';

export function InviteManager(){
  const [data,setData]=useState<InviteState|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[busy,setBusy]=useState<number|null>(null),[copied,setCopied]=useState<number|null>(null),[fallback,setFallback]=useState('');
  const load=useCallback(async(signal?:AbortSignal)=>{
    setError('');setLoading(true);
    try{const response=await fetch('/api/invites',{signal});const result=await response.json() as InviteState&{error?:string};if(!response.ok)throw new Error(result.error||'Could not load invites.');setData(result);}catch(e){if((e as Error).name!=='AbortError')setError((e as Error).message);}finally{if(!signal?.aborted)setLoading(false);}
  },[]);
  useEffect(()=>{const controller=new AbortController();void load(controller.signal);return()=>controller.abort();},[load]);
  async function copy(slot:number){
    setBusy(slot);setError('');setCopied(null);setFallback('');
    try{
      const response=await fetch('/api/invites',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slot})});
      const result=await response.json() as {code:string;path:string;error?:string};if(!response.ok)throw new Error(result.error||'Could not prepare your invite.');
      const url=new URL(result.path,window.location.origin).href;setFallback(url);
      setData(current=>current?{...current,slots:current.slots.map(s=>s.slot===slot?{...s,code:result.code}:s)}:current);
      try{await navigator.clipboard.writeText(url);setCopied(slot);}catch{setError('Copy the link below to share your invite.');}
    }catch(e){setError((e as Error).message);}finally{setBusy(null);}
  }
  return <ProductDisclosure title="Invite friends" meta={data?`${data.remaining} of ${data.total} left`:'5 invites'} defaultOpen>
    <div className="invite-manager"><div className="invite-manager-intro"><p>Each link admits one person.<span>They’ll get five invites when they join.</span></p><button className="text-button" aria-label="Refresh invites" disabled={loading||busy!==null} onClick={()=>void load()}><RefreshCw size={15}/></button></div>
      {loading&&!data?<p role="status">Loading your invites…</p>:data&&<div className="invite-slot-list">{data.slots.map(slot=><div className={`invite-slot${slot.claimed?' invite-used':''}`} key={slot.slot}><span className="invite-slot-icon">{slot.claimed?<Check size={17}/>:<Ticket size={17}/>}</span><div><b>{slot.claimed?slot.recipient:`Invite ${slot.slot}`}</b><span>{slot.claimed?'Joined Shot Call':slot.code?'Ready to share':'Available'}</span></div><button className="outline" disabled={slot.claimed||busy!==null} aria-label={`Copy invite ${slot.slot} link`} onClick={()=>void copy(slot.slot)}>{slot.claimed?'Used':busy===slot.slot?'Preparing…':copied===slot.slot?<><Check size={14}/> Copied</>:<><Copy size={14}/> Copy link</>}</button></div>)}</div>}
      {error&&<p className="form-error" role="alert">{error}</p>}
      {fallback&&<input aria-label="Your invite link" className="invite-link-fallback" readOnly value={fallback}/>}
      {!data&&!loading&&<button className="outline" onClick={()=>void load()}>Retry</button>}
    </div>
  </ProductDisclosure>;
}
