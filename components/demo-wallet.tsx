"use client";
import { useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Check, Layers, Loader2, Plus, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEMO_NETWORKS } from "@/lib/demo-wallet";
import { walletHistory } from "@/lib/wallet-history";
import { dollars } from "@/lib/data";
import { parseCents } from "@/lib/trading-fees";
import type { PaperOrder } from "@/lib/performance";

function NetworkLogo({name}:{name:string}) {
  const network=DEMO_NETWORKS.find(n=>n.name===name);
  return network?<img className="wallet-network-logo" src={network.icon} alt={`${name} logo`} width={24} height={24}/>:<Layers className="wallet-network-other" size={24} aria-hidden="true"/>;
}
type Props={userId:string|null;connected:boolean;balance:number|null;orders:PaperOrder[];theses:{id:string;title:string}[];open:boolean;setOpen:(open:boolean)=>void;onChange:()=>Promise<void>};
export function DemoWallet({userId,connected,balance,orders,theses,open,setOpen,onChange}:Props) {
  const [tab,setTab]=useState("fund"),[amount,setAmount]=useState("1000"),[network,setNetwork]=useState("Base"),[customNetwork,setCustomNetwork]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const pending=useRef<{key:string;id:string}|null>(null),running=useRef(false);
  const cents=parseCents(amount),selectedNetwork=network==="Other"?customNetwork.trim():network;
  const history=walletHistory(orders,theses);
  async function update(action:"connect"|"disconnect"|"fund") {
    if(running.current)return;
    running.current=true;setBusy(true);setError("");
    const key=JSON.stringify({action,amount:cents,network:selectedNetwork});
    if(pending.current?.key!==key)pending.current={key,id:crypto.randomUUID()};
    try {
      const res=await fetch("/api/demo-wallet",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,id:pending.current.id,...action==="fund"?{amount:cents,network:selectedNetwork}:{}})});
      const data=await res.json() as {error?:string};if(!res.ok)throw new Error(data.error||"Could not update your demo wallet.");
      pending.current=null;await onChange();
      toast.success(action==="connect"?"Demo wallet connected.":action==="disconnect"?"Demo wallet disconnected. Your balance is saved.":`${dollars(cents!)} added from ${selectedNetwork}.`);
      if(action==="disconnect")setOpen(false);
    }catch(e){setError(e instanceof Error?e.message:"Could not update your demo wallet. Retry to check the deposit.");}
    finally{running.current=false;setBusy(false);}
  }
  return <>
    <button className={`wallet-connect ${connected?"is-connected":""}`} onClick={()=>{setError("");setOpen(true);}}><Wallet size={16}/><span>{connected?dollars(balance??0):"Connect wallet"}</span>{connected&&<i/>}</button>
    <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}>
      <DialogContent className="app-dialog demo-wallet-dialog">
        <DialogTitle>{connected?"Wallet":"Connect wallet"}</DialogTitle>
        <DialogDescription>{connected?"Add demo USD from a network of your choice.":"Connect a demo wallet to start investing."}</DialogDescription>
        {!connected?<>
          <div className="demo-wallet-connect-intro"><div className="demo-wallet-glyph"><Wallet size={30}/></div><h3>{balance===null?"Start with $10,000.":`${dollars(balance)} ready to invest.`}</h3><p>Your balance and investments stay saved to your account.</p></div>
          {userId?<button className="dark wide" disabled={busy} onClick={()=>update("connect")}>{busy?<Loader2 size={16} className="spin"/>:<Wallet size={16}/>} Connect demo wallet</button>:<a className="dark wide" href="/signin-with-chatgpt?return_to=/" target="_top">Sign in to connect</a>}
        </>:<>
          <div className="demo-wallet-balance"><span>Available USD</span><strong>{dollars(balance??0)}</strong><small><Check size={12}/> Demo funds</small></div>
          <Tabs value={tab} onValueChange={setTab}><TabsList className="trade-tabs"><TabsTrigger value="fund">Add USD</TabsTrigger><TabsTrigger value="activity">Transaction history</TabsTrigger></TabsList></Tabs>
          {tab==="fund"?<form onSubmit={e=>{e.preventDefault();void update("fund");}}>
            <div className="wallet-field"><label htmlFor="demo-funding-network">From network</label><Select value={network} disabled={busy} onValueChange={setNetwork}><SelectTrigger id="demo-funding-network" className="wallet-network-trigger" aria-label="Funding network"><SelectValue/></SelectTrigger><SelectContent className="wallet-network-menu" position="popper">{DEMO_NETWORKS.map(n=><SelectItem key={n.name} value={n.name}><NetworkLogo name={n.name}/>{n.name}</SelectItem>)}<SelectItem value="Other"><NetworkLogo name="Other"/>Other network</SelectItem></SelectContent></Select></div>
            {network==="Other"&&<label className="wallet-field"><span>Network name</span><input aria-label="Network name" value={customNetwork} onChange={e=>setCustomNetwork(e.target.value)} minLength={2} maxLength={40} required disabled={busy}/></label>}
            <label className="demo-funding-amount"><span>Amount in USD</span><div><span>$</span><input aria-label="Demo deposit amount" aria-invalid={amount!==""&&(cents===null||cents<100||cents>100000000)} inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} disabled={busy}/><small>USD</small></div></label>
            {amount!==""&&(cents===null||cents<100||cents>100000000)&&<p className="form-error">Enter $1–$1,000,000 with up to two decimal places.</p>}
            <div className="demo-funding-presets">{[100,1000,10000].map(n=><button type="button" key={n} disabled={busy} onClick={()=>setAmount(String(n))}>+{dollars(n*100)}</button>)}</div>
            <div className="demo-funding-review"><span>Balance after deposit</span><b>{dollars((balance??0)+(cents&&cents>0?cents:0))}</b></div>
            <button className="dark wide" type="submit" disabled={busy||cents===null||cents<100||cents>100000000||selectedNetwork.length<2}>{busy?<Loader2 className="spin" size={16}/>:<Plus size={16}/>} Add {cents&&cents>0?dollars(cents):"USD"}</button>
          </form>:<div className="demo-transaction-list">{history.length?history.map(transaction=><div className="wallet-transaction" key={transaction.id}><span className="wallet-transaction-icon">{transaction.network?<NetworkLogo name={transaction.network}/>:transaction.delta<0?<ArrowUpRight size={20}/>:<ArrowDownLeft size={20}/>}</span><div className="wallet-transaction-detail"><b>{transaction.label}</b><span>{transaction.detail}</span><time dateTime={new Date(transaction.createdAt).toISOString()}>{new Date(transaction.createdAt).toLocaleString([],{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></div><strong className={transaction.delta<0?'outgoing':'incoming'}>{transaction.delta>0?'+':transaction.delta<0?'−':''}{dollars(Math.abs(transaction.delta))}</strong></div>):<p>Your transactions will appear here.</p>}</div>}
          <button className="demo-wallet-disconnect" disabled={busy} onClick={()=>update("disconnect")}>Disconnect demo wallet</button>
        </>}
        <p className="demo-wallet-footnote">Demo funds only. No real transfers or withdrawals.</p>
        {error&&<p className="form-error" role="alert">{error}</p>}
      </DialogContent>
    </Dialog>
  </>;
}
