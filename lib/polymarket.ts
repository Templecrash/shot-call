import type {Thesis} from './data';
import {HORMUZ_MARKET} from './hormuz-market';
import {tokenFor} from './token-catalog';

// Only verified market identities may be requested from the public provider.
const MARKETS = {HORMUZYES:HORMUZ_MARKET};
export type PolymarketReference = typeof HORMUZ_MARKET;
export type PolymarketQuote = {
  conditionId:string; question:string; url:string; yes:number; no:number;
  status:'open'|'paused'|'closed'; fetchedAt:number; updatedAt:string|null;
  yesTokenId?:string; noTokenId?:string; orderBookEnabled?:boolean;
};
export function polymarketFor(thesis:Thesis,key:string):PolymarketReference|null {
  if(!thesis.allocations.some(a=>a.symbol===key)||!Object.hasOwn(MARKETS,key))return null;
  const token=tokenFor(thesis,key),market=MARKETS[key as keyof typeof MARKETS];
  return token.instrument==='prediction'&&token.source===market.url&&token.identitySource===`https://clob.polymarket.com/markets/${market.conditionId}`?market:null;
}
export class PolymarketError extends Error {
  constructor(message='Market prices are temporarily unavailable.',public status=503){super(message);}
}
function array(value:unknown):unknown[] {
  try{const result=typeof value==='string'?JSON.parse(value):value;return Array.isArray(result)?result:[];}catch{return [];}
}
export function normalizePolymarket(raw:unknown,market:PolymarketReference,now=Date.now()):PolymarketQuote {
  const row=Array.isArray(raw)?raw.find(item=>item?.conditionId===market.conditionId):null;
  if(!row || typeof row.question!=='string' || !row.question.trim() || row.question.length>500)throw new PolymarketError();
  const outcomes=array(row.outcomes),prices=array(row.outcomePrices),ids=array(row.clobTokenIds);
  const yesIndex=outcomes.findIndex(value=>typeof value==='string'&&value.trim().toLowerCase()==='yes');
  const noIndex=outcomes.findIndex(value=>typeof value==='string'&&value.trim().toLowerCase()==='no');
  const price=(index:number)=>{
    const value=prices[index];
    if(index<0 || (typeof value!=='string'&&typeof value!=='number') || String(value).trim()==='')throw new PolymarketError();
    const number=Number(value);if(!Number.isFinite(number)||number<0||number>1)throw new PolymarketError();return number;
  };
  if(outcomes.length!==2 || prices.length!==2 || ids.length!==2 || yesIndex<0 || noIndex<0 || ids[yesIndex]!==market.yesTokenId || typeof ids[noIndex]!=='string' || !/^\d+$/.test(ids[noIndex] as string) || ids[noIndex]===ids[yesIndex])throw new PolymarketError();
  return {conditionId:market.conditionId,question:row.question.trim(),url:market.url,yes:price(yesIndex),no:price(noIndex),
    yesTokenId:ids[yesIndex] as string,noTokenId:ids[noIndex] as string,orderBookEnabled:row.enableOrderBook===true,
    status:row.closed===true||row.archived===true?'closed':row.active===true&&row.closed===false&&row.acceptingOrders===true?'open':'paused',fetchedAt:now,
    updatedAt:typeof row.updatedAt==='string'&&Number.isFinite(Date.parse(row.updatedAt))?row.updatedAt:null};
}
export async function fetchPolymarket(market:PolymarketReference,fetcher:typeof fetch=fetch):Promise<PolymarketQuote>{
  const response=await fetcher(`https://gamma-api.polymarket.com/markets?condition_ids=${encodeURIComponent(market.conditionId)}`,{
    headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000),
  });
  if(!response.ok)throw new PolymarketError();
  return normalizePolymarket(await response.json(),market);
}
