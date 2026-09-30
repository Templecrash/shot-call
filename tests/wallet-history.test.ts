import {test} from 'node:test';
import assert from 'node:assert/strict';
import {walletHistory} from '../lib/wallet-history';
import type {PaperOrder} from '../lib/performance';
const order=(side:string,amount:number,extra:Partial<PaperOrder>={}):PaperOrder=>({id:side,side,amount,thesisId:'take',createdAt:1,...extra});

test('wallet history shows actual cash debits and credits, with exit fees deducted once',()=>{
  const history=walletHistory([
    order('buy',10000,{tradingFee:200}),
    order('sell',15000,{tradingFee:300,creatorFee:25}),
    order('rule-exit',5000,{tradingFee:100}),
    order('creator-income',25),
    order('scenario',20000),
  ],[{id:'take',title:'Privacy, Repriced'}]);
  assert.deepEqual(history.map(t=>t.delta),[-10000,14675,4900,25]);
  assert.ok(history.every(t=>t.detail==='Privacy, Repriced'));
});
test('wallet history includes bets, refunds and deposits and sorts newest first',()=>{
  const history=walletHistory([
    order('prediction-stake',10000,{createdAt:1}),
    order('prediction-payout',15000,{createdAt:2}),
    order('prediction-refund',5000,{createdAt:3}),
    order('demo-fund',20000,{createdAt:4,executionReason:'network:Base'}),
  ],[]);
  assert.deepEqual(history.map(t=>t.delta),[20000,5000,15000,-10000]);
  assert.equal(history[0].network,'Base');
});
