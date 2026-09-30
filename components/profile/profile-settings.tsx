'use client';
import {useId,useState,type FormEvent} from 'react';
import {Loader2} from 'lucide-react';
import {toast} from 'sonner';
import {parseCents} from '@/lib/trading-fees';
import {MAX_BUY_AMOUNT} from '@/lib/profile-settings';

export function ProfileSettings({amount,onSaved}:{amount:number;onSaved:(amount:number)=>Promise<void>}) {
  const id=useId();
  const [value,setValue]=useState((amount/100).toFixed(2)),[saving,setSaving]=useState(false),[error,setError]=useState('');
  const cents=parseCents(value),valid=cents!==null&&cents>0&&cents<=MAX_BUY_AMOUNT;
  async function save(event:FormEvent) {
    event.preventDefault();
    if(!valid||saving)return;
    setSaving(true);setError('');
    try {
      const response=await fetch('/api/profile',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({defaultBuyAmount:cents})});
      const result=await response.json() as {defaultBuyAmount?:number;error?:string};
      if(!response.ok)throw new Error(result.error||'Could not save your settings.');
      await onSaved(result.defaultBuyAmount??cents!);
      toast.success('Default buy amount saved.');
    } catch(cause) {setError(cause instanceof Error?cause.message:'Could not save your settings.');}
    finally {setSaving(false);}
  }
  return <form className="profile-buy-preset" onSubmit={save}>
    <div><label htmlFor={id}>Default buy amount</label><p>Prefills Invest on every take. You can adjust it before buying.</p></div>
    <div className="profile-preset-input"><span aria-hidden="true">$</span><input id={id} aria-invalid={!valid} aria-describedby={`${id}-error`} inputMode="decimal" autoComplete="off" maxLength={15} value={value} disabled={saving} onChange={event=>{setValue(event.target.value);setError('');}}/><span>USD</span></div>
    <button className="outline" type="submit" disabled={!valid||saving||cents===amount}>{saving?<><Loader2 size={14} className="spin"/> Saving…</>:'Save preset'}</button>
    <p id={`${id}-error`} className="profile-preset-error" role={error?'alert':undefined}>{error||(!valid?'Enter $0.01–$1,000,000 with up to two decimal places.':'')}</p>
  </form>;
}
