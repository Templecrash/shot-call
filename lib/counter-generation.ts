import {TOKENS,type Allocation,type Thesis} from './data';
import {fullExposure,isStablecoin} from './allocations';
import {tokenFor} from './token-catalog';
import {loadPerpMarkets,perpMarketFor,type PerpMarket} from './perps';
import {fetchPolymarket,polymarketFor,type PolymarketQuote,type PolymarketReference} from './polymarket';
import {counterMetadata,type CounterPlan,type CounterRoute} from './counter-strategy';

export const COUNTER_MODEL='counter-markets-v1';
const VENUE='https://app.hyperliquid.xyz/trade';
const alternatives=[
  {symbol:'IMX',reason:'Optional broader gaming/NFT infrastructure short. Immutable supports games and digital ownership. It does not track physical-card gacha demand.'},
  {symbol:'GALA',reason:'Optional broader gaming and entertainment short. Gala uses digital game assets, but this position does not directly reverse collectibles tokens.'},
];
export type CounterInputs={markets:PerpMarket[]|null;quotes:Record<string,PolymarketQuote|null>;now?:number};

// Use authoritative token identities and current venue data, never ticker-only
// guesses or model-created contracts. Alternatives remain opt-in suggestions.
export function assembleCounter(source:Thesis,id:string,input:CounterInputs):Thesis {
  const now=input.now??Date.now(),routes:CounterRoute[]=[],omitted:CounterPlan['omitted']=[],notes:string[]=[];
  let coveredWeight=0;
  for(const a of source.allocations.filter(a=>a.weight>0)){
    const token=tokenFor(source,a.symbol),side=a.side==='short'?'long':'short';
    if(isStablecoin(token.symbol)){omitted.push({symbol:a.symbol,reason:'Stablecoin capital has no directional position to reverse.'});continue;}
    const market=polymarketFor(source,a.symbol);
    if(token.instrument==='prediction'){
      const quote=input.quotes[a.symbol];
      if(!market||!quote||quote.conditionId!==market.conditionId||quote.status!=='open'||!quote.orderBookEnabled){omitted.push({symbol:a.symbol,reason:'No open, verified binary Polymarket contract is available for the opposite outcome.'});continue;}
      const outcome=side==='short'?'NO':'YES',price=side==='short'?quote.no:quote.yes;
      if(!(price>0&&price<1)){omitted.push({symbol:a.symbol,reason:'This outcome has no usable current price.'});continue;}
      routes.push({allocation:{symbol:a.symbol,weight:a.weight,execution:'spot',leverage:1,side},kind:'outcome',question:quote.question,price,reason:`Buy ${outcome} on the same question as the original. The external market’s rules and deadline decide the outcome.`,source:market.url});
    }else if(side==='long'){
      routes.push({allocation:{symbol:a.symbol,weight:a.weight,side:'long',execution:'spot',leverage:1},kind:'direct',reason:`Own ${token.symbol} to oppose the original short. Spot exposure benefits when the underlying rises.`,source:token.source});
    }else{
      const perp=input.markets&&perpMarketFor(source,a.symbol,input.markets);
      if(!perp){omitted.push({symbol:a.symbol,reason:input.markets===null?'Perp availability could not be checked. Retry the market check.':token.instrument==='stock'?'No supported short contract for this stock token.':'No identity-verified perp is listed on the supported venue (Hyperliquid).'});continue;}
      routes.push({allocation:{symbol:a.symbol,weight:a.weight,side:'short',execution:'perps',leverage:1},kind:'direct',reason:`Short ${token.symbol} on Hyperliquid to oppose the original long. Uses isolated margin with creator-selected leverage.`,source:VENUE});
    }
    coveredWeight+=a.weight;
  }
  const allocations=fullExposure(routes.map(r=>r.allocation));
  for(const route of routes)route.allocation=allocations.find(a=>a.symbol===route.allocation.symbol)!;
  if(input.markets===null)notes.push('The perp venue could not be reached. Unchecked shorts were left out; retry to check them.');
  if(!routes.some(r=>r.kind==='outcome'))notes.push('No matching open Polymarket position was found in the original call. No unrelated outcome bet has been added.');
  const allLong=source.allocations.filter(a=>a.weight>0&&!isStablecoin(tokenFor(source,a.symbol).symbol)).every(a=>a.side!=='short');
  const collectibles=source.category==='Gacha & collectibles'||source.category==='Gaming';
  if(omitted.length&&allLong&&collectibles&&input.markets){
    for(const candidate of alternatives){
      if(source.allocations.some(a=>a.symbol===candidate.symbol)||!perpMarketFor({tokens:undefined} as Thesis,candidate.symbol,input.markets))continue;
      routes.push({allocation:{symbol:candidate.symbol,weight:0,side:'short',execution:'perps',leverage:1},kind:'alternative',reason:candidate.reason,source:TOKENS[candidate.symbol].source});
    }
  }
  const plan:CounterPlan={checkedAt:now,coveredWeight,routes,omitted,notes};
  return {
    id,title:`Against ${source.title}`.slice(0,90),
    body:`I disagree with “${source.title}”. I expect the original thesis to weaken and will take the opposite side through the supported positions below.`.slice(0,1500),
    summary:`The counter call to ${source.title}.`.slice(0,180),category:source.category,author:'You',
    allocations,createdAt:now,version:1,executionVersion:1,parent:source.id,
    counter:{...counterMetadata(source),generationId:id,plan},engine:'curated',visibility:'private',tokens:source.tokens,
    evidenceNote:'Assembled from the original call and checked market availability. Supported direct positions retain their relative weights. Broader alternatives require your selection and are not exact hedges.',
    risk:'Perp shorts can lose when prices rise and can be liquidated; funding and trading costs also matter. Broader alternatives can diverge from the original tokens. Polymarket outcomes follow their own resolution rules, not token returns. This app simulates positions; it does not execute or settle external trades.',
  };
}

export async function generateCounter(source:Thesis,id:string,deps:{loadMarkets?:()=>Promise<PerpMarket[]>;quote?:(market:PolymarketReference)=>Promise<PolymarketQuote>}={}){
  const marketKeys=source.allocations.filter(a=>polymarketFor(source,a.symbol));
  const [markets,quotes]=await Promise.all([
    (deps.loadMarkets||(async()=>(await loadPerpMarkets(true)).markets))().catch(()=>null),
    Promise.all(marketKeys.map(async a=>[a.symbol,await (deps.quote||fetchPolymarket)(polymarketFor(source,a.symbol)!).catch(()=>null)] as const)),
  ]);
  return assembleCounter(source,id,{markets,quotes:Object.fromEntries(quotes)});
}

export function validateGeneratedCounter(source:Thesis,version:number,allocations:Allocation[],generated:Thesis){
  const counter=generated.counter;
  if(source.version!==version||counter?.sourceId!==source.id||counter.sourceVersion!==version)throw new Error('The original call changed. Generate a fresh counter call.');
  if(!counter.generationId||!counter.plan)throw new Error('Generate the counter assets again before saving.');
  if(!allocations.some(a=>a.weight>0))throw new Error('Choose at least one supported counter position.');
  for(const a of allocations){
    const route=counter.plan.routes.find(r=>r.allocation.symbol===a.symbol),expected=route?.allocation;
    if(!expected||a.side!==expected.side)throw new Error('Use the verified counter candidates and their opposing directions.');
    if(expected.execution==='perps'&&expected.side==='short'&&a.execution!=='perps')throw new Error('A counter short must use its verified perp contract, not spot.');
    if(route.kind==='outcome'&&(a.execution==='perps'||(a.leverage??1)!==1))throw new Error('Polymarket outcomes cannot use perp leverage.');
  }
  return counter;
}

export async function validateCounterOutcomes(thesis:Thesis,quote=fetchPolymarket){
  if(!thesis.counter?.generationId)return;
  for(const allocation of thesis.allocations.filter(a=>a.weight>0)){
    if(tokenFor(thesis,allocation.symbol).instrument!=='prediction')continue;
    const market=polymarketFor(thesis,allocation.symbol);
    if(!market)throw new Error('This Polymarket contract could not be verified. Generate a fresh counter.');
    const current=await quote(market),price=allocation.side==='short'?current.no:current.yes;
    if(current.status!=='open'||!current.orderBookEnabled||!(price>0&&price<1))throw new Error('This Polymarket contract is no longer open. Remove it or generate a fresh counter.');
  }
}
