'use client';
import {useState} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
import {dollars,type Thesis} from '@/lib/data';
import type {ThesisInvestment} from '@/lib/thesis-investments';

export function ManageTakeDialog({take,investment,onClose,onAction}:{take:Thesis|null;investment?:ThesisInvestment|null;onClose:()=>void;onAction:(action:'close'|'archive')=>Promise<void>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function act(action:'close'|'archive') {if(busy)return;setBusy(true);setError('');try{await onAction(action);}catch(e){setError(e instanceof Error?e.message:'Could not update take.');}finally{setBusy(false);}}
  return <Dialog open={!!take} onOpenChange={open=>{if(!open&&!busy){setError('');onClose();}}}><DialogContent className="app-dialog manage-take-dialog"><DialogTitle>Manage take</DialogTitle><DialogDescription>{take?.title}</DialogDescription>
    {investment&&investment.investors>0&&<p className="small-muted">{investment.investors} {investment.investors===1?'investor':'investors'} · {dollars(investment.aum)} invested</p>}
    {!take?.closedAt&&!take?.archivedAt?<div className="manage-take-option"><h3>Close to new investment</h3><p>Stop new investments. Existing holders keep their positions and choose when to sell. Selling your own position does not sell anyone else’s.</p><button className="dark wide" disabled={busy} onClick={()=>void act('close')}>{busy?'Updating…':'Close to new investment'}</button></div>:<p className="take-closed-note">Closed to new investment. Existing holders can still sell.</p>}
    <div className="manage-take-option"><h3>Remove from profile</h3><p>Hide this take from your profile and discovery once all investments are closed. History is preserved, and you can restore it from My takes.</p><button className="outline wide" disabled={busy||!investment||investment.investors>0} onClick={()=>void act('archive')}>Remove take</button>{investment&&investment.investors>0&&<p className="small-muted">Available once every investor has exited.</p>}</div>
    {error&&<p className="form-error" role="alert">{error}</p>}
  </DialogContent></Dialog>;
}
export function RemovedTake({take,onRestore}:{take:Thesis;onRestore:()=>Promise<void>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <div className="removed-take"><div><b>{take.title}</b><small>{take.closedAt?'Closed':'Removed'} · History preserved</small>{error&&<p className="form-error" role="alert">{error}</p>}</div><button className="outline" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onRestore();}catch(e){setError(e instanceof Error?e.message:'Could not restore take.');}finally{setBusy(false);}}}>{busy?'Restoring…':'Restore'}</button></div>;
}
