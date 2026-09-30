import type {PaperOrder} from './performance';
import {fundingNetwork} from './demo-wallet';
import {predictionFlow} from './predictions/model';

export function walletHistory(orders:PaperOrder[], theses:{id:string;title:string}[]) {
  const titles=new Map(theses.map(t=>[t.id,t.title]));
  return orders.flatMap(order=>{
    const prediction=predictionFlow(order.side,order.amount);
    let delta:number, label:string;
    switch (order.side) {
      case 'demo-fund': delta=order.amount; label='Deposit'; break;
      case 'buy': delta=-order.amount; label=order.executionMode==='perps'?`Bought ${order.leverage}× perps`:'Bought take'; break;
      case 'sell':
      case 'rule-exit':
        delta=order.amount-(order.tradingFee||0)-(order.creatorFee||0)-(order.platformProfitFee||0);
        label=order.side==='sell'?(order.executionMode==='perps'?'Closed perps':'Sold take'):order.executionReason==='liquidation'?'Liquidation':'Automatic exit';
        break;
      case 'creator-income': delta=order.amount; label='Creator earnings'; break;
      default:
        if (prediction===null) return [];
        delta=prediction;
        label=order.side==='prediction-stake'?'Archived prediction stake':order.side==='prediction-refund'?'Prediction refund':'Archived prediction payout';
    }
    const network=order.side==='demo-fund'?fundingNetwork(order):null;
    return [{id:order.id,label,delta,network,detail:network||titles.get(order.thesisId)||'Saved take',createdAt:order.createdAt}];
  }).sort((a,b)=>b.createdAt-a.createdAt);
}
