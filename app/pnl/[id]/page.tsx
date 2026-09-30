import Link from 'next/link';
import {notFound} from 'next/navigation';
import type {Metadata} from 'next';
import {database} from '@/db/raw';
import {savedPnlCard} from '@/lib/pnl-card-store';
import {pnlPercent} from '@/lib/pnl-card';
import {PnlCard} from '@/components/pnl/pnl-card';
export const dynamic='force-dynamic';
const origin='https://supertake-crypto-sascha.saschadarius.chatgpt.site';
export async function generateMetadata({params}:{params:Promise<{id:string}>}):Promise<Metadata>{
  const {id}=await params;let card=null;try{card=await savedPnlCard(database(),id);}catch{}
  if(!card)return {title:'P&L card · Shot Call',openGraph:{images:[]},twitter:{images:[]},robots:{index:false,follow:false}};
  const title=`${card.title} · ${pnlPercent(card.percent)} ${card.label}`;
  const description=`${card.creator.handle?'@'+card.creator.handle:card.creator.name}'s demo performance, net of fees. A dated snapshot of simulated returns.`;
  const image=`${origin}/api/pnl/${encodeURIComponent(id)}/image`;
  return {title,description,robots:{index:false,follow:false},openGraph:{title,description,url:`${origin}/pnl/${encodeURIComponent(id)}`,images:[{url:image,width:1200,height:800}]},twitter:{card:'summary_large_image',title,description,images:[image]}};
}
export default async function Page({params}:{params:Promise<{id:string}>}){
  const {id}=await params;let card=null;try{card=await savedPnlCard(database(),id);}catch{return <main className="pnl-public-page"><h1>Card unavailable</h1><p>Please try again shortly.</p><Link href="/">Shot Call</Link></main>;}
  if(!card)notFound();
  return <main className="pnl-public-page"><Link className="wordmark" href="/">Shot Call<span>✳</span></Link><PnlCard card={card}/><div className="pnl-public-actions"><a className="outline" href={`/api/pnl/${encodeURIComponent(id)}/image`} download={`shot-call-pnl-${id}.png`}>Download PNG</a>{card.thesisPath&&<Link className="dark" href={card.thesisPath}>Explore call</Link>}</div><p>Demo performance · Net of fees · Frozen at the date shown</p></main>;
}
