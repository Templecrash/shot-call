'use client';
import {useEffect,useRef,useState} from 'react';
import {Loader2,RefreshCw,Sparkles} from 'lucide-react';
import {ThesisArtwork} from './thesis-artwork';
import {thesisArtwork} from '@/lib/artwork';
import type {Thesis} from '@/lib/data';
import type {TakeIdentity} from '@/lib/take-identity';

export function TakeIdentityPreview({draft,signedIn,onIdentity}:{draft:Thesis;signedIn:boolean;onIdentity:(identity:TakeIdentity,originalTitle:string)=>void}){
  const [status,setStatus]=useState(draft.artworkStatus||'checking');
  const [error,setError]=useState('');
  const [attempt,setAttempt]=useState(0);
  const [source,setSource]=useState(()=>{
    let cached:string|undefined;
    try{const stored=JSON.parse(sessionStorage.getItem(`coinviction:art:${draft.id}`)||'null') as {id:string;body:string;category:string}|null;if(stored?.body===draft.body&&stored.category===draft.category&&/^[0-9a-f-]{36}$/i.test(stored.id))cached=stored.id;}catch{}
    return {body:draft.body,category:draft.category,title:draft.title,id:draft.artworkId||cached||crypto.randomUUID(),existing:!!(draft.artworkId||cached),retry:false};
  });
  const request=useRef<Promise<TakeIdentity>|null>(null);
  useEffect(()=>{
    let cancelled=false,timer:ReturnType<typeof setTimeout>|undefined;
    const controller=new AbortController(),snapshot=source;let activeId=snapshot.id,missing=0;
    const receive=(identity:TakeIdentity)=>{
      if(cancelled)return;
      activeId=identity.id;
      try{if(['ready','generating'].includes(identity.status)||identity.status==='failed'&&snapshot.existing)sessionStorage.setItem(`coinviction:art:${draft.id}`,JSON.stringify({id:identity.id,body:snapshot.body,category:snapshot.category}));}catch{}
      setStatus(identity.status);setError(identity.error||'');onIdentity(identity,snapshot.title);
    };
    async function poll(){
      try{
        const res=await fetch(`/api/take-identity?id=${activeId}`,{signal:controller.signal});
        if(res.status===404&&++missing>=3){receive({id:activeId,thesisId:draft.id,body:snapshot.body,title:snapshot.title,status:'failed',error:'This saved image request could not be found. You can explicitly retry artwork.'});return;}
        if(res.ok){missing=0;const identity=await res.json() as TakeIdentity;receive(identity);if(identity.status!=='generating')return;}
      }catch{/* The original request can still return its result. */}
      if(!cancelled)timer=setTimeout(poll,2500);
    }
    async function start(){
      if(!signedIn){if(!cancelled)setStatus('signed-out');return;}
      if(snapshot.existing){await Promise.resolve();receive({id:snapshot.id,thesisId:draft.id,body:snapshot.body,title:snapshot.title,status:'generating',error:'Recovering your saved artwork…'});await poll();return;}
      if(!request.current){
        if(!snapshot.retry){
          const recovered=await fetch(`/api/take-identity?thesisId=${draft.id}`,{signal:controller.signal}).then(r=>r.ok?r.json() as Promise<{identity:TakeIdentity|null}>:null);
          if(cancelled)return;
          if(recovered?.identity?.body===snapshot.body&&recovered.identity.category===snapshot.category){
            receive(recovered.identity);if(recovered.identity.status==='generating')timer=setTimeout(poll,2500);return;
          }
        }
        const config=await fetch('/api/take-identity',{signal:controller.signal}).then(r=>r.json() as Promise<{ready:boolean}>);
        if(cancelled)return;
        if(!config.ready){receive({id:snapshot.id,thesisId:draft.id,body:snapshot.body,title:snapshot.title,status:'unavailable'});return;}
        try{sessionStorage.setItem(`coinviction:art:${draft.id}`,JSON.stringify({id:snapshot.id,body:snapshot.body,category:snapshot.category}));}catch{}
        // Keep this paid request alive across dialog closure; never repeat it on effect cleanup.
        request.current=fetch('/api/take-identity',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:snapshot.id,thesisId:draft.id,body:snapshot.body,category:snapshot.category,retry:snapshot.retry})}).then(async r=>{
          const value=await r.json() as TakeIdentity;
          if(!r.ok){if(r.status===429||r.status===401||r.status===403)try{sessionStorage.removeItem(`coinviction:art:${draft.id}`);}catch{}return {id:snapshot.id,thesisId:draft.id,body:snapshot.body,title:snapshot.title,status:'failed',error:value.error||'The image could not finish.'} as TakeIdentity;}
          return value;
        }).catch(async()=>{
          try{const recovered=await fetch(`/api/take-identity?id=${snapshot.id}`);if(recovered.ok)return await recovered.json() as TakeIdentity;}catch{}
          return {id:snapshot.id,thesisId:draft.id,body:snapshot.body,title:snapshot.title,status:'generating',error:'The connection ended. Checking your saved image request…'} as TakeIdentity;
        });
      }
      receive({id:snapshot.id,thesisId:draft.id,body:snapshot.body,title:snapshot.title,status:'generating'});
      timer=setTimeout(poll,2500);
      const result=await request.current;receive(result);
      if(result.status!=='generating'&&timer)clearTimeout(timer);
    }
    void start().catch(()=>{if(!cancelled){receive({id:snapshot.id,thesisId:draft.id,body:snapshot.body,title:snapshot.title,status:'failed',error:'Could not check image availability.'});}});
    return()=>{cancelled=true;controller.abort();if(timer)clearTimeout(timer);};
  },[draft.id,signedIn,attempt,onIdentity,source]);
  const changed=source.body!==draft.body||source.category!==draft.category;
  function retry(){setSource({body:draft.body,category:draft.category,title:draft.title,id:crypto.randomUUID(),existing:false,retry:true});request.current=null;setStatus('checking');setError('');setAttempt(a=>a+1);}
  return <div className="identity-preview">
    <div className="identity-cover"><ThesisArtwork src={thesisArtwork(draft)} compact={false}/><div className="card-shade"/><span>{draft.category}</span><h3>{draft.title}</h3><small>Shot Call✳</small></div>
    <div className="identity-status" role="status">
      {status==='checking'||status==='generating'?<><Loader2 size={14} className="spin"/><span>{status==='checking'?'Preparing your cover…':error||'Creating a name and original artwork… This may take a few minutes.'}</span></>:status==='ready'?<><Sparkles size={14}/><span>{changed?'Your take changed. Generate a new cover when you’re ready.':'Original AI artwork · Yours to review'}</span></>:<><Sparkles size={14}/><span>{status==='unavailable'?'Using a topic cover for now.':status==='signed-out'?'Topic cover · Sign in to create original AI artwork.':error||'Using a topic cover for now.'}</span></>}
      {signedIn&&(status==='failed'||status==='ready'&&changed)&&<button type="button" onClick={retry}><RefreshCw size={13}/>{changed?'Update artwork':'Retry artwork'}</button>}
    </div>
  </div>;
}
