'use client';
import {useState} from 'react';
import {Ticket,Loader2} from 'lucide-react';
import {inviteCode} from '@/lib/invites';

export function InviteEntry({code,signedIn,signInHref,next,inviter,problem}:{code:string;signedIn:boolean;signInHref:string;next:string;inviter:string|null;problem:string}){
  const [input,setInput]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  async function accept(){
    setBusy(true);setError('');
    try{
      const response=await fetch('/api/invites/redeem',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
      const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||'Your invite could not be accepted.');
      window.location.assign(next);
    }catch(e){setError((e as Error).message);setBusy(false);}
  }
  function open(e:React.FormEvent){e.preventDefault();const parsed=inviteCode(input);if(!parsed){setError('Paste a Shot Call invite link or code.');return;}window.location.assign(`/invite/${parsed}?next=${encodeURIComponent(next)}`);}
  return <main className="invite-page"><a className="wordmark" href="/">Shot Call<span>✳</span></a><section className="invite-entry-card">
    <div className="invite-mark"><Ticket size={25}/></div><span className="eyebrow">Invite only</span>
    <h1>{code&&!problem?'You’re invited.':'By invitation.'}</h1>
    <p className="invite-intro">{code&&!problem?`${inviter||'A member'} invited you to Shot Call. Join the market conversation, then bring five people with you.`:'Shot Call is open by invitation. Ask a member for a link to join.'}</p>
    {problem&&<p className="form-error" role="alert">{problem}</p>}
    {code&&!problem ? <>{signedIn?<button className="dark invite-join" disabled={busy} onClick={()=>void accept()}>{busy?<><Loader2 className="spin" size={17}/> Joining…</>:'Accept invite'}</button>:<a className="dark invite-join" href={signInHref} target="_top">Sign in to accept invite</a>}<p className="invite-note">Your membership includes 5 invites.</p></> : <form onSubmit={open} className="invite-code-form"><label htmlFor="invite-code">Have an invite?</label><input id="invite-code" value={input} onChange={e=>{setInput(e.target.value);setError('');}} placeholder="Paste your invite link or code" autoComplete="off" spellCheck={false} maxLength={240} required/><button className="dark" type="submit">Continue with invite</button></form>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    {!signedIn&&<p className="invite-member-signin">Already a member? <a href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in</a></p>}
    {signedIn&&<a className="invite-switch-account" href="/signout-with-chatgpt?return_to=%2Finvite" target="_top">Use a different account</a>}
  </section><p className="invite-page-footer">Shot Call · Invite-only access</p></main>;
}
