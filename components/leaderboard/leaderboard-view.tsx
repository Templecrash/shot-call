'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {RefreshCw,ArrowRight} from 'lucide-react';
import {CreatorAvatar} from '@/components/creator';
import type {LeaderboardData} from '@/lib/leaderboard';
import type {Creator} from '@/lib/creators';
import {LEADERBOARD_PREVIEW} from '@/lib/leaderboard-preview';

type Props={user:{id:string;name:string;creator?:Creator|null}|null;onCreator:(id:string)=>void;onDiscover:()=>void;onEditCreator:()=>void};
const date=(value:number)=>new Date(value).toLocaleDateString('en-US',{month:'short',day:'numeric',timeZone:'UTC'});
const pnl=(cents:number)=>`${cents>0?'+':cents<0?'−':''}${(Math.abs(cents)/100).toLocaleString('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2})}`;
export function LeaderboardView({user,onCreator,onDiscover,onEditCreator}:Props){
  const [data,setData]=useState<LeaderboardData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [sampleOverride,setSampleOverride]=useState<boolean|null>(null);
  useEffect(()=>{
    const url=new URL(location.href);url.searchParams.delete('period');url.searchParams.delete('board');history.replaceState({},'',url.pathname+url.search+url.hash);
    let controller:AbortController|null=null,disposed=false,resetTimer:ReturnType<typeof setTimeout>|undefined;
    const load=async()=>{
      controller?.abort();controller=new AbortController();
      try{
        const response=await fetch('/api/leaderboard',{signal:controller.signal,cache:'no-store'}),value=await response.json() as LeaderboardData&{error?:string};
        if(!response.ok)throw new Error(value.error||'Could not load the leaderboard.');
        if(!disposed){
          setData(value);setError('');
          clearTimeout(resetTimer);
          resetTimer=setTimeout(()=>{setData(null);setLoading(true);void load();},Math.max(100,value.resetsAt-value.checkedAt+100));
        }
      }catch(cause){if(!disposed&&!(cause instanceof DOMException&&cause.name==='AbortError'))setError(cause instanceof Error?cause.message:'Could not load the leaderboard.');}
      finally{if(!disposed)setLoading(false);}
    };
    void load();
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void load();},60000);
    const onVisible=()=>{if(document.visibilityState==='visible')void load();};
    document.addEventListener('visibilitychange',onVisible);
    return()=>{disposed=true;controller?.abort();clearInterval(timer);clearTimeout(resetTimer);document.removeEventListener('visibilitychange',onVisible);};
  },[revision]);
  const enrolled=!!user?.creator?.leaderboardOptIn;
  // Give a sparse platform a populated preview without mixing examples into real ranks.
  const showSample=sampleOverride ?? (data?.entries.length ?? 0)<5;
  const entries=showSample?LEADERBOARD_PREVIEW:(data?.entries ?? []);
  return <section className="weekly-leaderboard">
    <div className="weekly-board-heading"><div><h1>Leaderboard</h1><p>Highest P&L this week.</p></div>{!enrolled&&(user?<button className="outline" onClick={onEditCreator}>Join leaderboard</button>:<a className="outline" href="/signin-with-chatgpt?return_to=/?view=leaderboard">Sign in to join</a>)}</div>
    <div className="weekly-board-period"><span>This week{data&&<> <span>·</span> {date(data.start)} – {date(data.resetsAt-1)}</>}</span><span className="weekly-board-reset">Resets Monday · 00:00 UTC</span><button type="button" aria-label="Refresh leaderboard" onClick={()=>setRevision(value=>value+1)} disabled={loading}><RefreshCw size={14}/></button></div>
    {loading&&!data?<div className="weekly-board-empty" role="status">Loading leaderboard…</div>:error?<div className="weekly-board-empty" role="alert"><p>{error}</p><button className="outline" onClick={()=>setRevision(value=>value+1)}>Try again</button></div>:<>
      <div className="weekly-board-preview">
        <div><b>{showSample?`Sample activity · ${entries.length} investors`:'Recorded performance'}</b>{showSample&&<p>Fictional profiles and illustrative P&L.</p>}</div>
        <button type="button" onClick={()=>setSampleOverride(!showSample)}>{showSample?'View recorded P&L':'Preview sample activity'} <ArrowRight size={12}/></button>
      </div>
      {entries.length?<table className="weekly-board-table">
        <thead><tr><th scope="col">Rank</th><th scope="col">Profile</th><th scope="col">Weekly P&L</th></tr></thead>
        <tbody>{entries.map(entry=>{
          const person=<><CreatorAvatar creator={entry.creator}/><span><b>{entry.creator.name}{entry.creator.id===user?.creator?.id&&<small className="weekly-you">You</small>}</b><small>{entry.creator.handle?`@${entry.creator.handle}`:'Creator'}</small></span></>;
          return <tr key={entry.creator.id} className={entry.creator.id===user?.creator?.id?'is-you':undefined}>
            <td><span className={`weekly-rank ${entry.rank<=3?'podium':''}`}>{entry.rank}</span></td>
            <td>{showSample?<div className="weekly-board-person">{person}</div>:<Link href={`/creator/${encodeURIComponent(entry.creator.id)}`} prefetch={false} className="weekly-board-person" onClick={event=>{event.preventDefault();onCreator(entry.creator.id);}}>{person}</Link>}</td>
            <td><span className={`weekly-pnl ${entry.profitCents>0?'up':entry.profitCents<0?'down':'flat'}`}>{pnl(entry.profitCents)}</span></td>
          </tr>;
        })}</tbody>
      </table>:<div className="weekly-board-empty"><h2>No results this week</h2><p>Investment P&L appears here once people join the leaderboard.</p><button className="outline" onClick={onDiscover}>Explore takes <ArrowRight size={14}/></button></div>}
    </>}
    <p className="weekly-board-note">{showSample?'Sample scores are illustrative, separate from recorded investment results.':'Demo investment P&L · Gains and losses after fees.'}{!showSample&&data&&<span> Updated <time dateTime={new Date(data.checkedAt).toISOString()}>{new Date(data.checkedAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</time>.</span>}</p>
    <details className="weekly-board-method"><summary>How P&L is counted</summary><p>Realized and unrealized investment gains since Monday at 00:00 UTC, after trading and creator fees. Funding, creator earnings and archived prediction cash flows don’t count. Each new week starts from the current value of open positions, so earlier gains don’t carry over. Equal P&L shares a rank.</p></details>
  </section>;
}
