import type {Thesis} from './data';
import {isStablecoin} from './allocations';
import {perpMarketFor,type PerpMarket} from './perps';
import {tokenFor} from './token-catalog';
import {polymarketFor} from './polymarket';

export type HedgeSnapshot={markets:PerpMarket[];checkedAt:number};
export type HedgeLeg={key:string;symbol:string;title:string;reason:string;direction:'long'|'short';notional:number;offset?:number;remaining?:number;collateral?:number;marketUrl?:string};
export type HedgeAssessment={budget:number;checkedAt:number|null;summary:string;legs:HedgeLeg[]};

// Never promote missing, malformed or old market data into a verified route.
export function readHedgeSnapshot(value:unknown,now=Date.now()):HedgeSnapshot|null{
 if(!value||typeof value!=='object')return null;
 const row=value as Partial<HedgeSnapshot>;
 if(!Number.isFinite(row.checkedAt)||row.checkedAt!>now+5000||now-row.checkedAt!>120000||!Array.isArray(row.markets))return null;
 const valid=row.markets.every(m=>m&&typeof m.symbol==='string'&&/^[A-Z0-9]+$/.test(m.symbol)&&Number.isInteger(m.maxLeverage)&&m.maxLeverage>=1&&Number.isFinite(m.markPrice)&&m.markPrice>0&&Number.isFinite(m.funding)&&Number.isFinite(m.maintenanceBps)&&m.maintenanceBps>0);
 return valid?{markets:row.markets,checkedAt:row.checkedAt!}:null;
}

export function hedgeInputError(thesis:Thesis,budget:number):string|null{
 if(!Number.isFinite(budget)||budget<=0)return 'Enter a positive preview budget to assess a hedge.';
 if(!thesis.allocations.length||thesis.allocations.some(a=>!Number.isFinite(a.weight)||a.weight<0||a.weight>100)||Math.abs(thesis.allocations.reduce((n,a)=>n+a.weight,0)-100)>0.001)return 'Set your allocations to 100% before assessing a hedge.';
 if(new Set(thesis.allocations.map(a=>a.symbol)).size!==thesis.allocations.length)return 'Use one allocation per asset before assessing a hedge.';
 if(thesis.allocations.some(a=>a.execution==='perps'&&(!Number.isInteger(a.leverage??1)||(a.leverage??1)<1||(a.leverage??1)>10)))return 'Choose valid leverage between 1× and 10×.';
 return null;
}

export function assessHedge(thesis:Thesis,budget:number,snapshot:HedgeSnapshot|null,now=Date.now()):HedgeAssessment{
 const error=hedgeInputError(thesis,budget);if(error)throw new Error(error);
 const verified=readHedgeSnapshot(snapshot,now);
 const legs=thesis.allocations.filter(a=>a.weight>0).map((a):HedgeLeg=>{
  const token=tokenFor(thesis,a.symbol),perp=a.execution==='perps',direction=a.side==='short'?'short':'long';
  const notional=Math.round(budget*a.weight/100*(perp?(a.leverage??1):1)),offset=Math.round(notional*.25),remaining=notional-offset;
  const base:Pick<HedgeLeg,'key'|'symbol'|'direction'|'notional'>={key:a.symbol,symbol:token.symbol,direction,notional};
  if(token.instrument==='prediction'){
   const market=polymarketFor(thesis,a.symbol);
   return {...base,title:'Reduce the event stake',reason:'A smaller stake directly lowers event risk. The opposite outcome can offset the same contract only when sized by share count, not equal dollars. Live outcome prices and open-market status must be checked before sizing it; no share quantity is suggested here.',marketUrl:market?.url};
  }
  if(isStablecoin(token.symbol)&&direction==='long'&&!perp)return {...base,title:'Keep the dollar exposure',reason:'A crypto short would add a new directional bet. Review issuer, custody and depeg concentration instead; a second token from the same issuer does not diversify issuer risk.'};
  if(perp)return {...base,title:`Reduce the ${direction.toUpperCase()} perp`,reason:`Reduce this contract’s notional to lower directional exposure. An opposite order should reduce the existing position, not create a second independent hedge. Changing a leverage setting alone on a live position does not necessarily reduce its size.`,offset,remaining};
  const market=verified?perpMarketFor(thesis,a.symbol,verified.markets):undefined;
  if(market&&direction==='long')return {...base,title:`Offset with a SHORT ${market.symbol} perp`,reason:'A matching short can offset part of this token’s long exposure. The 1× illustration below requires separate collateral, adds funding and liquidation risk, and only offsets this asset. It is an external overlay: changing this row from Spot to Short Perp would replace the long, not add a hedge.',offset,remaining,collateral:offset};
  return {...base,title:direction==='short'?'Cover part of the short':'Reduce this allocation',reason:direction==='short'?'Covering part of this short directly reduces its upside-squeeze exposure. A different long token is not a measured hedge.':token.instrument==='stock'?'No matching stock derivative is verified here. A smaller allocation directly lowers exposure; an unrelated crypto short is not a measured hedge.':verified?'No matching perp is verified for this asset. Reduce its allocation rather than substitute an unrelated contract.':'Matching perp availability could not be verified. Reducing the allocation remains a direct way to lower exposure.',offset,remaining};
 }).sort((a,b)=>b.notional-a.notional);
 const onlyStables=legs.every(l=>l.offset===undefined&&!l.marketUrl&&isStablecoin(l.symbol));
 return {budget,checkedAt:verified?.checkedAt??null,summary:onlyStables?'No directional hedge suggested for this stablecoin call.':'Start by reducing the largest sources of exposure. Matching token hedges and position reductions are assessed separately below.',legs};
}
