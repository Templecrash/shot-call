import type {Position, Thesis} from './data';
import {hasCreatorShare, settleProfitShare} from './profit-share';
import {PLATFORM_PROFIT_SHARE_BPS} from './trading-fees';

export const DEFAULT_PERFORMANCE_FEE_BPS = 200;
export const MAX_PERFORMANCE_FEE_BPS = 2000;
export const FEE_POLICY = 'v3';
// Quarter-basis-point units preserve the exact 25% split at every selectable rate.
export type FeeRates = {creatorUnits:number;platformUnits:number};
export type FeeTerms = FeeRates & {version:1;creatorId:string|null;baseHighWater:number;creatorPaidBase:number;platformPaidBase:number};
type FeePosition = Pick<Position,'amount'|'invested'|'feeTerms'|'shareEligible'|'shareRealized'|'shareHighWater'|'sharePaid'|'platformRealized'|'platformHighWater'|'platformPaid'>;
export function selectedFeeBps(thesis:Pick<Thesis,'performanceFeeBps'>) {
  const bps=thesis.performanceFeeBps??DEFAULT_PERFORMANCE_FEE_BPS;
  if(!Number.isSafeInteger(bps)||bps<0||bps>MAX_PERFORMANCE_FEE_BPS)throw new Error('Choose a performance fee from 0% to 20%.');
  return bps;
}
export function feeRates(bps:number):FeeRates {
  selectedFeeBps({performanceFeeBps:bps});
  const platformUnits=Math.min(bps,1000);
  return {platformUnits,creatorUnits:bps*4-platformUnits};
}
export function investmentFeeRates(thesis:Thesis,userId?:string):FeeRates {
  const rates=feeRates(selectedFeeBps(thesis));
  return {...rates,creatorUnits:hasCreatorShare(thesis,userId)?rates.creatorUnits:0};
}
export function feePercent(units:number){return `${Number((units/400).toFixed(4))}%`;}
export function readFeeTerms(raw:string|null|undefined):FeeTerms|null {
  if(!raw)return null;
  const t=JSON.parse(raw) as FeeTerms;
  if(t.version!==1||!['creatorUnits','platformUnits','baseHighWater','creatorPaidBase','platformPaidBase'].every(k=>Number.isSafeInteger(t[k as keyof FeeTerms])&&Number(t[k as keyof FeeTerms])>=0)||t.platformUnits>1000||t.creatorUnits+t.platformUnits>8000||(t.creatorId!==null&&typeof t.creatorId!=='string')||(t.creatorUnits>0&&!t.creatorId))throw new Error('Saved performance fee terms are invalid.');
  return t;
}
export function positionFeeRates(position:FeePosition):FeeRates {
  return readFeeTerms(position.feeTerms)??{creatorUnits:position.shareEligible?200:0,platformUnits:PLATFORM_PROFIT_SHARE_BPS*4};
}
export function startFeeTerms(thesis:Thesis,userId:string,position?:FeePosition):FeeTerms {
  const rates=investmentFeeRates(thesis,userId),creatorId=hasCreatorShare(thesis,userId)?thesis.owner!:null,old=readFeeTerms(position?.feeTerms);
  if(old&&old.creatorUnits===rates.creatorUnits&&old.platformUnits===rates.platformUnits&&old.creatorId===creatorId)return old;
  return {version:1,...rates,creatorId,baseHighWater:position?.platformHighWater||0,creatorPaidBase:position?.sharePaid||0,platformPaidBase:position?.platformPaid||0};
}
export function settlePositionFees(position:FeePosition,proceeds:number,closeAll=false,releasedCost?:number) {
  const terms=readFeeTerms(position.feeTerms);
  if(!terms){
    const creator=settleProfitShare(position,proceeds,closeAll,0,undefined,releasedCost);
    const platform=settleProfitShare({...position,shareEligible:true,shareRealized:position.platformRealized,shareHighWater:position.platformHighWater,sharePaid:position.platformPaid},proceeds,closeAll,0,PLATFORM_PROFIT_SHARE_BPS,releasedCost);
    return {...creator,platformProfitFee:platform.fee,platformRealized:platform.shareRealized,platformHighWater:platform.shareHighWater,platformPaid:platform.sharePaid,netProceeds:creator.netProceeds-platform.fee};
  }
  const sale=settleProfitShare({...position,shareEligible:false},proceeds,closeAll,0,0,releasedCost);
  const realized=(position.platformRealized||0)+sale.realizedProfit;
  const highWater=Math.max(position.platformHighWater||0,realized,0);
  const profit=Math.max(0,highWater-terms.baseHighWater);
  // Each recipient rounds down cumulatively. No split can overcharge the total;
  // fractional cents carry forward through partial sales and same-rate re-entry.
  const due=(units:number)=>Number(BigInt(profit)*BigInt(units)/40000n);
  const fee=Math.max(0,terms.creatorPaidBase+due(terms.creatorUnits)-(position.sharePaid||0));
  const platformProfitFee=Math.max(0,terms.platformPaidBase+due(terms.platformUnits)-(position.platformPaid||0));
  return {...sale,fee,platformProfitFee,shareRealized:realized,shareHighWater:highWater,sharePaid:(position.sharePaid||0)+fee,platformRealized:realized,platformHighWater:highWater,platformPaid:(position.platformPaid||0)+platformProfitFee,netProceeds:proceeds-fee-platformProfitFee};
}
