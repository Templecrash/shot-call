import type { PaperOrder } from './performance';
import type { Position } from './data';

export type TradePnl = {
  orderId: string;
  thesisId: string;
  side: 'buy' | 'sell' | 'rule-exit';
  cost: number;
  profit: number | null;
  percent: number | null;
  realized: number | null;
  unrealized: number | null;
  value: number | null;
  status: 'Open' | 'Partially closed' | 'Closed' | 'Realized' | 'Unavailable';
};
type Entry = {order:PaperOrder; originalCost:number; cost:number; value:number; realized:number; proceeds:number; incomplete:boolean};

// Allocate whole cents without creating or losing a cent. Stable remainders
// also keep attribution consistent when several entries share one position.
function split(total:number,weights:number[]):number[] {
  const sum=weights.reduce((a,b)=>a+b,0);
  if(!sum)return weights.map(()=>0);
  const divisor=BigInt(sum), amount=BigInt(total);
  const parts=weights.map((w,i)=>({i,value:Number(amount*BigInt(w)/divisor),remainder:amount*BigInt(w)%divisor}));
  let left=total-parts.reduce((n,p)=>n+p.value,0);
  for(const part of [...parts].sort((a,b)=>a.remainder===b.remainder?a.i-b.i:a.remainder>b.remainder?-1:1)){
    if(!left)break;part.value++;left--;
  }
  return parts.map(p=>p.value);
}

export function tradePnl(orders:PaperOrder[],positions:Position[]):Record<string,TradePnl> {
  const books=new Map<string,Entry[]>(), results:Record<string,TradePnl>={};
  for(const order of [...orders].sort((a,b)=>a.createdAt-b.createdAt)){
    if(!['buy','sell','rule-exit','scenario'].includes(order.side))continue;
    const entries=books.get(order.thesisId)||[];
    if(order.side==='buy'){
      entries.push({order,originalCost:order.amount,cost:order.amount,value:order.amount-(order.tradingFee||0),realized:0,proceeds:0,incomplete:false});
      books.set(order.thesisId,entries);continue;
    }
    const value=entries.reduce((s,e)=>s+e.value,0), cost=entries.reduce((s,e)=>s+e.cost,0);
    if(order.side==='scenario'){
      if(order.amount>0&&!value)entries.forEach(e=>{e.incomplete=true;});
      const values=split(order.amount,entries.map(e=>e.value));
      entries.forEach((e,i)=>{e.value=values[i];});continue;
    }
    const full=order.side==='rule-exit';
    const valid=entries.length>0 && (full ? value>0||order.amount===0 : value>0&&order.amount<=value);
    if(!valid){
      entries.forEach(e=>{e.incomplete=true;});
      results[order.id]={orderId:order.id,thesisId:order.thesisId,side:order.side as 'sell'|'rule-exit',cost:0,profit:null,percent:null,realized:null,unrealized:null,value:null,status:'Unavailable'};
      continue;
    }
    const remainingCost=full?0:order.costBasis!==null&&order.costBasis!==undefined?cost-order.costBasis:value?Math.round(cost*((value-order.amount)/value)):0;
    const released=cost-remainingCost;
    const proceeds=order.amount-(order.tradingFee||0)-(order.creatorFee||0)-(order.platformProfitFee||0);
    const grossParts=split(order.amount,entries.map(e=>e.value));
    const costParts=split(released,entries.map(e=>e.cost));
    const netParts=split(proceeds,entries.map(e=>e.value));
    entries.forEach((e,i)=>{
      if(!valid)e.incomplete=true;
      e.realized+=netParts[i]-costParts[i];e.proceeds+=netParts[i];
      e.cost=full?0:e.cost-costParts[i];e.value=full?0:e.value-grossParts[i];
    });
    const profit=valid?(proceeds-released)/100:null;
    results[order.id]={orderId:order.id,thesisId:order.thesisId,side:order.side as 'sell'|'rule-exit',cost:released/100,
      profit,percent:profit!==null&&released>0?profit/(released/100)*100:null,
      realized:profit,unrealized:0,value:proceeds/100,status:valid?'Realized':'Unavailable'};
  }
  for(const [id,entries] of books){
    const position=positions.find(p=>p.thesisId===id);
    const open=entries.filter(e=>e.cost>0||e.value>0);
    const weights=open.map(e=>e.value);
    const known=position ? !position.amount || weights.some(v=>v>0) : !open.length;
    const values=split(position?.amount||0,weights);
    const costs=split(position?.invested||0,open.map(e=>e.cost));
    open.forEach((e,i)=>{e.value=values[i];e.cost=costs[i];if(!known)e.incomplete=true;});
    for(const entry of entries){
      const realized=entry.realized/100,unrealized=(entry.value-entry.cost)/100;
      const profit=entry.incomplete?null:realized+unrealized;
      const active=entry.cost>0||entry.value>0;
      results[entry.order.id]={orderId:entry.order.id,thesisId:id,side:'buy',cost:entry.originalCost/100,
        profit,percent:profit!==null&&entry.originalCost>0?profit/(entry.originalCost/100)*100:null,
        realized:entry.incomplete?null:realized,unrealized:entry.incomplete?null:unrealized,
        value:entry.incomplete?null:(entry.value+entry.proceeds)/100,
        status:entry.incomplete?'Unavailable':active?(entry.cost<entry.originalCost?'Partially closed':'Open'):'Closed'};
    }
  }
  return results;
}
