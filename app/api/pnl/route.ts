import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {database} from '@/db/raw';
import {ownPnlCard,savePnlCard,readPnlImage,PnlCardError} from '@/lib/pnl-card-store';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request){
  try{
    const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to share your P&L.'},{status:401,headers});
    const url=new URL(req.url);
    return Response.json(await ownPnlCard(database(),user.userId,url.searchParams.get('kind')||'trade',url.searchParams.get('orderId'),url.searchParams.get('hideAmounts')==='true'),{headers});
  }catch(error){return failure(error);}
}
export async function POST(req:Request){
  try{
    const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to share your P&L.'},{status:401,headers});
    if(req.headers.get('origin')&&new URL(req.headers.get('origin')!).origin!==new URL(req.url).origin)return Response.json({error:'Invalid origin.'},{status:403,headers});
    const data=new URL(req.url).searchParams,asOf=Number(data.get('asOf'));
    if(!Number.isSafeInteger(asOf)||asOf>Date.now()+1000||Date.now()-asOf>300000)throw new PnlCardError('Refresh the card before sharing.',409);
    const result=await ownPnlCard(database(),user.userId,String(data.get('kind')||'trade'),String(data.get('orderId')||''),data.get('hideAmounts')==='true',asOf);
    if(result.fingerprint!==data.get('fingerprint'))throw new PnlCardError('Your position changed. Refresh the card before sharing.',409);
    const image=await readPnlImage(req);
    return Response.json(await savePnlCard(database(),env.BUCKET,user.userId,result.card,image),{status:201,headers});
  }catch(error){return failure(error);}
}
function failure(error:unknown){
  if(error instanceof PnlCardError)return Response.json({error:error.message},{status:error.status,headers});
  console.error('P&L card unavailable',error);
  return Response.json({error:'Your P&L card could not be prepared. Please retry.'},{status:503,headers});
}
