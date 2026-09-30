import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fullExposure,wantsStablecoins} from '../lib/allocations';
import {categoryForTake,nameTake} from '../lib/take-name';

test('stablecoin holdings require explicit intent, not platform exposure or rejection',()=>{
  for(const body of ['Be in stables for this next week','Stay in USDC until the market settles','Park my capital in stablecoins','Hold 20% USDC and buy ETH','Stables for the next week','Wait in cash for a week'])
    assert.equal(wantsStablecoins(body),true,body);
  for(const body of ['Privacy coins are going to rip','Stablecoin platforms will win','Buy stablecoin platform tokens','Hold ONDO because stablecoins will grow','I do not want USDC','Do not hold stables','Sell USDC and buy ETH','This is the bottom for the majors'])
    assert.equal(wantsStablecoins(body),false,body);
  assert.equal(categoryForTake('Be in stables for this next week'),'Stables');
  assert.equal(nameTake('Be in stables for this next week','Stables'),'A Week on the Sidelines');
});

test('full exposure preserves proportions and direction with deterministic rounding',()=>{
  assert.deepEqual(fullExposure([{symbol:'BNOON',weight:40,side:'short'},{symbol:'USOON',weight:30,side:'short'},{symbol:'HORMUZYES',weight:20}]),[
    {symbol:'BNOON',weight:45,side:'short'},{symbol:'USOON',weight:33,side:'short'},{symbol:'HORMUZYES',weight:22},
  ]);
  assert.deepEqual(fullExposure([{symbol:'ETH',weight:90}]),[{symbol:'ETH',weight:100}]);
  assert.deepEqual(fullExposure([]),[]);
});
