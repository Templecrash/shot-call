import {getChatGPTUser} from '@/app/chatgpt-auth';
import {database} from '@/db/raw';
import {readThesis} from '@/lib/thesis-store';
import {fetchPolymarket,polymarketFor,PolymarketError,type PolymarketQuote} from '@/lib/polymarket';

const cache=new Map<string,PolymarketQuote>();
const pending=new Map<string,Promise<PolymarketQuote>>();
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export async function GET(req:Request){
  try{
    const params=new URL(req.url).searchParams,thesisId=params.get('thesisId'),symbol=params.get('symbol');
    if(!thesisId||thesisId.length>80||!symbol||symbol.length>140)return json({error:'Choose a take and market.'},400);
    const user=await getChatGPTUser(),thesis=await readThesis(database(),thesisId,user?.userId);
    if(!thesis)return json({error:'This take is unavailable.'},404);
    const market=polymarketFor(thesis,symbol);
    if(!market)return json({error:'A verified Polymarket market is not available for this holding.'},404);
    const saved=cache.get(market.conditionId);
    if(saved&&Date.now()-saved.fetchedAt<30000)return json(saved);
    let request=pending.get(market.conditionId);
    if(!request){
      request=fetchPolymarket(market).then(quote=>{cache.set(market.conditionId,quote);return quote;}).finally(()=>pending.delete(market.conditionId));
      pending.set(market.conditionId,request);
    }
    return json(await request);
  }catch(error){return json({error:error instanceof PolymarketError?error.message:'Market prices are temporarily unavailable.'},error instanceof PolymarketError?error.status:503);}
}
