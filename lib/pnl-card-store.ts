import {loadPaperProfile} from './profile-performance-store';
import {publicCreator,type CreatorRow} from './creators';
import {readThesis} from './thesis-store';
import {thesisArtwork} from './artwork';
import {EXAMPLES} from './data';
import {pnlFingerprint,type PnlCardData} from './pnl-card';

export class PnlCardError extends Error{constructor(message:string,public status=400){super(message);}}
export async function readPnlImage(req:Request){
  if(req.headers.get('content-type')!=='image/png')throw new PnlCardError('Use a PNG card.');
  if(Number(req.headers.get('content-length')||0)>5000000)throw new PnlCardError('Use a PNG card under 5 MB.',413);
  if(!req.body)throw new PnlCardError('The card image is missing.');
  const reader=req.body.getReader(),parts:ArrayBuffer[]=[];let size=0;
  try{
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
      if(size>5000000){await reader.cancel();throw new PnlCardError('Use a PNG card under 5 MB.',413);}
      parts.push(value.slice().buffer as ArrayBuffer);
    }
  }finally{reader.releaseLock();}
  return new File(parts,'pnl.png',{type:'image/png'});
}
export async function ownPnlCard(db:D1Database,userId:string,kind:string,orderId:string|null,hidden:boolean,asOf=Date.now()){
  if(!['trade','portfolio'].includes(kind))throw new PnlCardError('Choose a trade or portfolio card.');
  const [profile,row]=await Promise.all([
    loadPaperProfile(db,userId,asOf),
    db.prepare('SELECT * FROM creator_profiles WHERE user_id=?').bind(userId).first<CreatorRow>(),
  ]);
  const creator=row?publicCreator(row):null;
  let title='My market calls',label='Portfolio P&L',status='All time',cost=profile.funded,profit=profile.performance.profit,
    realized=profile.performance.realized,unrealized=profile.performance.unrealized,execution='Demo portfolio',artwork='/og-shot-call.png',
    thesisPath:string|null=null,tradeAt:number|null=null,costLabel='Funded capital';
  if(kind==='trade'){
    const order=profile.orders.find(o=>o.id===orderId),pnl=order&&profile.tradePnl[order.id];
    if(!order||!pnl)throw new PnlCardError('This trade is not available in your activity.',404);
    if(pnl.profit===null||pnl.percent===null)throw new PnlCardError('A complete trade history is needed to share this P&L.',409);
    const thesis=await readThesis(db,order.thesisId,userId);
    title=thesis?.title||'My market call';cost=pnl.cost;profit=pnl.profit;realized=pnl.realized;unrealized=pnl.unrealized;status=pnl.status;
    label=order.side==='buy'?'Buy P&L':'Realized P&L';costLabel=order.side==='buy'?'Entry investment':'Cost basis';
    execution=order.executionMode==='perps'?`${order.leverage||1}× demo perps`:'Demo spot';tradeAt=order.createdAt;
    thesisPath=thesis?.visibility!=='private'&&thesis&&!thesis.archivedAt?`/take/${thesis.id}`:null;
    const publicArt=thesis?.visibility==='private'?EXAMPLES.find(t=>t.category===thesis.category):thesis;
    artwork=publicArt?thesisArtwork(publicArt):'/og-shot-call.png';
  } else if(!profile.performance.trades)throw new PnlCardError('Place a trade before sharing portfolio P&L.');
  if(profit===null||cost<=0)throw new PnlCardError('Your P&L is unavailable right now.',409);
  const card:PnlCardData={title,kind:kind as 'trade'|'portfolio',label,status,
    profit:hidden?null:profit,percent:profit/cost*100,cost:hidden?null:cost,costLabel,
    realized:hidden?null:realized,unrealized:hidden?null:unrealized,execution,artwork,thesisPath,
    creator:{name:creator?.name||'Shot Call trader',handle:creator?.handle||null,avatarUrl:creator?.avatarUrl||null,twitterUrl:creator?.twitterUrl||null},
    asOf,tradeAt,amountsHidden:hidden};
  return {card,fingerprint:await pnlFingerprint(card)};
}

export async function savePnlCard(db:D1Database,bucket:R2Bucket|undefined,userId:string,card:PnlCardData,image:File){
  if(!bucket)throw new PnlCardError('Sharing is unavailable right now. You can still download the card.',503);
  if(image.type!=='image/png'||image.size>5000000||image.size<24)throw new PnlCardError('Use a PNG card under 5 MB.');
  const bytes=new Uint8Array(await image.arrayBuffer());
  if(![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v))throw new PnlCardError('The card image could not be read.');
  const id=crypto.randomUUID(),key=`pnl-cards/${id}.png`;
  await bucket.put(key,bytes,{httpMetadata:{contentType:'image/png'}});
  try{
    await db.prepare('INSERT INTO pnl_cards(id,user_id,payload,image_key,created_at) VALUES(?,?,?,?,?)').bind(id,userId,JSON.stringify(card),key,Date.now()).run();
  }catch(error){await bucket.delete(key).catch(()=>{});throw error;}
  return {id,path:`/pnl/${id}`};
}
export async function savedPnlCard(db:D1Database,id:string){
  const row=await db.prepare('SELECT payload FROM pnl_cards WHERE id=?').bind(id).first<{payload:string}>();
  return row?JSON.parse(row.payload) as PnlCardData:null;
}
