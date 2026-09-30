import test from 'node:test';
import assert from 'node:assert/strict';
import {tradePnl} from '../lib/trade-pnl';
import {paperPerformance,type PaperOrder} from '../lib/performance';
const order=(id:string,side:string,amount:number,extra:Partial<PaperOrder>={}):PaperOrder=>({id,side,amount,thesisId:'a',createdAt:Number(id),...extra});
const position=(amount:number,invested:number)=>({id:'p',thesisId:'a',amount,invested,takeProfit:null,stopLoss:null});
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<0.000001,`${a} != ${b}`);

test('each entry and exit includes the entry fee and both profit shares',()=>{
  const orders=[order('1','buy',100000,{tradingFee:50,feePolicy:'v2'}),order('2','scenario',119940),order('3','sell',119940,{platformProfitFee:598,creatorFee:100})];
  const p=tradePnl(orders,[]);
  assert.equal(p['1'].profit,192.42);assert.equal(p['1'].status,'Closed');assert.equal(p['3'].profit,192.42);close(p['3'].percent!,19.242);assert.equal(p['3'].cost,1000);
});
test('partial sells retain exact rounded average cost and realized/unrealized entry attribution',()=>{
  const orders=[order('1','buy',10000),order('2','scenario',13333),order('3','sell',4444)];
  const p=tradePnl(orders,[position(8889,6667)]);
  assert.equal(p['3'].cost,33.33);assert.equal(p['3'].profit,11.11);assert.equal(p['1'].status,'Partially closed');close(p['1'].realized!,11.11);close(p['1'].unrealized!,22.22);close(p['1'].profit!,33.33);
});
test('top-ups share later moves but do not inherit gains from before their entry',()=>{
  const orders=[order('1','buy',10000),order('2','scenario',12000),order('3','buy',10000),order('4','scenario',24200),order('5','sell',12100)];
  const positions=[position(12100,10000)],p=tradePnl(orders,positions);
  close(p['1'].profit!,32);close(p['3'].profit!,10);close(p['5'].profit!,21);
  const profile=paperPerformance(orders,positions,992100,100);
  close(p['1'].profit!+p['3'].profit!,profile.performance.profit!);
});
test('liquidation produces a -100% entry loss and later entries start a new trade',()=>{
  const orders=[order('1','buy',10000,{executionMode:'perps',leverage:5}),order('2','rule-exit',0,{executionReason:'liquidation'}),order('3','buy',20000),order('4','scenario',22000)];
  const p=tradePnl(orders,[position(22000,20000)]);
  assert.equal(p['1'].percent,-100);assert.equal(p['2'].percent,-100);assert.equal(p['2'].profit,-100);assert.equal(p['3'].percent,10);assert.equal(p['3'].status,'Open');
});
test('deposits, creator earnings and sentiment stakes have no investment P&L',()=>{
  const orders=[order('1','demo-fund',9000),order('2','creator-income',100),order('3','prediction-stake',10000),order('4','buy',10000,{tradingFee:5})];
  const p=tradePnl(orders,[position(9995,10000)]);
  assert.deepEqual(Object.keys(p),['4']);assert.equal(p['4'].profit,-0.05);assert.equal(p['4'].percent,-0.05);
});
test('unmatched sales and missing snapshots are unavailable instead of invented profit',()=>{
  assert.equal(tradePnl([order('1','sell',10000)],[])['1'].profit,null);
  assert.equal(tradePnl([order('1','buy',10000)],[])['1'].profit,null);
});
test('cent allocations reconcile many entries, sales and a current authoritative valuation',()=>{
  const orders:PaperOrder[]=[];let value=0,cost=0,realized=0,cash=1000000,n=0;
  for(let i=0;i<12;i++){const amount=10001+i;orders.push(order(String(++n),'buy',amount));value+=amount;cost+=amount;cash-=amount;}
  for(let i=0;i<6;i++){
    value=Math.round(value*1.073);orders.push(order(String(++n),'scenario',value));
    const amount=Math.floor(value/7),remainingCost=Math.round(cost*(value-amount)/value),fee=17;
    orders.push(order(String(++n),'sell',amount,{tradingFee:fee}));realized+=amount-fee-(cost-remainingCost);cost=remainingCost;value-=amount;cash+=amount-fee;
  }
  const positions=[position(value+123,cost)],p=tradePnl(orders,positions),profile=paperPerformance(orders,positions,cash,100);
  close(orders.filter(o=>o.side==='buy').reduce((s,o)=>s+p[o.id].profit!,0),profile.performance.profit!);
  close(orders.filter(o=>o.side==='sell').reduce((s,o)=>s+p[o.id].profit!,0),realized/100);
});
