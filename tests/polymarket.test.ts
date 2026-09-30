import assert from 'node:assert/strict';
import test from 'node:test';
import {EXAMPLES} from '../lib/data';
import {HORMUZ_MARKET} from '../lib/hormuz-market';
import {TOKENS} from '../lib/data';
import {fetchPolymarket,normalizePolymarket,polymarketFor} from '../lib/polymarket';
const take=EXAMPLES.find(t=>t.id==='hormuz-reopened')!;
const row={conditionId:HORMUZ_MARKET.conditionId,question:HORMUZ_MARKET.question,outcomes:'["Yes","No"]',outcomePrices:'["0.115","0.885"]',clobTokenIds:JSON.stringify([HORMUZ_MARKET.yesTokenId,'123']),active:true,closed:false,acceptingOrders:true};
test('market quotes are linked to an allocated and verified outcome identity',()=>{
  assert.equal(polymarketFor(take,'HORMUZYES'),HORMUZ_MARKET);
  assert.equal(polymarketFor(take,'BNOON'),null);
  assert.equal(polymarketFor({...take,allocations:[]},'HORMUZYES'),null);
  assert.equal(polymarketFor({...take,tokens:{HORMUZYES:{...TOKENS.HORMUZYES,source:'https://polymarket.com/event/another-market'}}},'HORMUZYES'),null);
  assert.throws(()=>normalizePolymarket([{...row,conditionId:'different'}],HORMUZ_MARKET));
  assert.throws(()=>normalizePolymarket([{...row,clobTokenIds:'["wrong","123"]'}],HORMUZ_MARKET));
});
test('Yes and No prices follow outcome labels, including reversed arrays',()=>{
  const quote=normalizePolymarket([row],HORMUZ_MARKET,1234);
  assert.equal(quote.yes,.115);assert.equal(quote.no,.885);assert.equal(quote.fetchedAt,1234);assert.equal(quote.status,'open');
  const reverse=normalizePolymarket([{...row,outcomes:['No','Yes'],outcomePrices:['0.8','0.2'],clobTokenIds:['123',HORMUZ_MARKET.yesTokenId]}],HORMUZ_MARKET);
  assert.equal(reverse.yes,.2);assert.equal(reverse.no,.8);
});
test('missing, malformed and out-of-range prices never become fabricated odds',()=>{
  for(const prices of ['[null,"0.9"]','["","0.9"]','["1.1","0.9"]','["NaN","0.9"]','bad json','["0.1"]'])assert.throws(()=>normalizePolymarket([{...row,outcomePrices:prices}],HORMUZ_MARKET));
  assert.equal(normalizePolymarket([{...row,closed:true,outcomePrices:'["0","1"]'}],HORMUZ_MARKET).status,'closed');
  assert.equal(normalizePolymarket([{...row,acceptingOrders:false}],HORMUZ_MARKET).status,'paused');
});
test('provider failures surface an unavailable state instead of example prices',async()=>{
  await assert.rejects(()=>fetchPolymarket(HORMUZ_MARKET,async()=>new Response('',{status:429})),/temporarily unavailable/);
  const quote=await fetchPolymarket(HORMUZ_MARKET,async url=>{assert.match(String(url),/^https:\/\/gamma-api\.polymarket\.com\/markets\?condition_ids=0x/);return Response.json([row]);});
  assert.equal(quote.yes,.115);
});
