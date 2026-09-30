import {test} from 'node:test';
import assert from 'node:assert/strict';
import {researchTake,GenerationError,type ProviderResult} from '../lib/ai/provider';
import {checkedToken,resolveResearch,fetchCoin,sourceObserved,type CoinMetadata} from '../lib/ai/resolve';
import {reportSchema,REPORT_JSON_SCHEMA,publicUrl,type AIReport} from '../lib/ai/schema';
import {tokenFit,ecosystemProducts} from '../lib/research';
import {tokenFor,mergedCatalog} from '../lib/token-catalog';
import {liveAsset} from '../lib/wallet/networks';
import {TOKENS} from '../lib/data';

const take='Decentralized exchanges are the next crypto growth category';
const coin:CoinMetadata={id:'uniswap',name:'Uniswap',symbol:'uni',asset_platform_id:'ethereum',platforms:{ethereum:'0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984'},links:{homepage:['https://uniswap.org/']},image:{small:'https://coin-images.coingecko.com/coins/images/12504/small/uniswap-uni.png'}};
export function fixtureReport():AIReport{return {title:'The Exchange Economy',summary:'A thesis about decentralized trading.',category:'Custom',risk:'Governance-token demand may diverge from exchange activity.',evidence_note:'A hypothesis, not a forecast.',allocation_rationale:'A concentrated platform thesis with a dollar reserve.',reserve_weight:10,candidates:[{name:'Uniswap',symbol:'UNI',coingecko_id:'uniswap',exposure:'Platform',reason:'Uniswap governance is linked to a decentralized exchange ecosystem.',risk:'Governance tokens do not guarantee a claim on revenue.',source_url:'https://uniswap.org/',official_url:'https://uniswap.org/',weight:90,watchlist_reason:null}],products:[{name:'Uniswap',url:'https://uniswap.org/',type:'Exchange',description:'A decentralized exchange protocol.',token_note:'UNI is governance exposure.',source_url:'https://uniswap.org/'}]};}
const fixtureProvider=(report=fixtureReport()):ProviderResult=>({report,sources:[{url:'https://uniswap.org/',title:'Uniswap'}],responseId:'resp_fixture',model:'test-fixture',usage:{input_tokens:50,output_tokens:100},raw:{}});
function response(report=fixtureReport()){return {id:'resp_fixture',model:'test-fixture',status:'completed',usage:{input_tokens:50,output_tokens:100},output:[{type:'web_search_call',status:'completed',action:{sources:[{url:'https://uniswap.org/',title:'Uniswap'}]}},{type:'message',content:[{type:'output_text',text:JSON.stringify(report),annotations:[]}]}]};}

test('a novel AI token is identified, allocated, sourced and displayed without a preset basket',async()=>{
  const result=await resolveResearch(fixtureProvider(),take,'fixture',async()=>coin,1000);
  const thesis=result.thesis!;
  assert.equal(thesis.engine,'ai');assert.equal(thesis.body,take);
  assert.deepEqual(thesis.allocations,[{symbol:'cg:uniswap',weight:100}]);
  assert.equal(tokenFor(thesis,'cg:uniswap').symbol,'UNI');
  assert.equal(tokenFit(thesis,'cg:uniswap').kind,'Platform');
  assert.equal(ecosystemProducts(thesis)[0].name,'Uniswap');
  assert.equal(liveAsset('cg:uniswap',8453),undefined);
  assert.equal(TOKENS.UNI,undefined);
  assert.equal(mergedCatalog([thesis])['cg:uniswap'].name,'Uniswap');
});

test('a colliding ticker cannot select an existing wallet asset',()=>{
  const candidate={...fixtureReport().candidates[0],symbol:'ETH',coingecko_id:'fake-eth',official_url:'https://uniswap.org/'};
  const match=checkedToken(candidate,{...coin,id:'fake-eth',symbol:'eth'});
  assert.equal(match?.key,'cg:fake-eth');assert.equal(liveAsset(match!.key,1),undefined);
  assert.equal(checkedToken(candidate,{...coin,id:'fake-eth',symbol:'uni'}),null);
  assert.equal(checkedToken(candidate,{...coin,id:'ethereum',symbol:'eth'}),null);
});

test('unverified identity, missing source or migrating token stays outside the allocation',async()=>{
  for(const mode of ['missing-source','identity','migration','outage']){
    const provider=fixtureProvider();
    if(mode==='missing-source')provider.sources=[];
    if(mode==='identity')provider.report.candidates[0].official_url='https://uniswap.org.attacker.example/';
    if(mode==='migration'){provider.report.candidates[0].watchlist_reason='Token migration in progress';provider.report.candidates[0].weight=0;provider.report.reserve_weight=100;}
    const result=await resolveResearch(provider,take,'fixture',async()=>mode==='outage'?null:coin);
    assert.equal(result.thesis,null,mode);assert.equal(result.research.watchlist.length,1,mode);
  }
});

test('rejected allocations are excluded and verified exposure is reweighted without adding USDC',async()=>{
  const p=fixtureProvider();p.report.candidates[0].weight=60;p.report.candidates.push({...p.report.candidates[0],name:'Unknown',symbol:'UNK',coingecko_id:null,weight:30});
  const r=await resolveResearch(p,take,'fixture',async()=>coin);
  assert.deepEqual(r.thesis?.allocations,[{symbol:'cg:uniswap',weight:100}]);
  assert.match(r.research.notes,/reweighted/);assert.match(r.research.notes,/concentration/);
});

test('duplicate identities are counted once, even with different descriptions',async()=>{
  const p=fixtureProvider();p.report.candidates[0].weight=60;p.report.candidates.push({...p.report.candidates[0],weight:30});
  const r=await resolveResearch(p,take,'fixture',async()=>coin);
  assert.equal(r.thesis?.allocations.length,1);assert.equal(r.research.watchlist.length,1);
});

test('schema rejects invented URL schemes and inconsistent allocations',()=>{
  for(const url of ['http://example.com','https://localhost/a','https://127.0.0.1/a','https://[::1]','https://x.local','https://user:pass@example.com','javascript:alert(1)'])assert.equal(publicUrl(url),false,url);
  assert.equal(publicUrl('https://docs.uniswap.org/'),true);
  const r=fixtureReport();r.reserve_weight=20;assert.throws(()=>reportSchema.parse(r));
  r.reserve_weight=10;r.candidates[0].watchlist_reason='Pending launch';assert.throws(()=>reportSchema.parse(r));
});

test('editing the take invalidates its previous AI fit assessment',async()=>{
  const r=await resolveResearch(fixtureProvider(),take,'fixture',async()=>coin);
  assert.equal(tokenFit({...r.thesis!,body:'A completely different take'},'cg:uniswap').kind,'Unmatched');
});

test('provider request requires live search and structured output, and persists before validation',async()=>{
  let sent:{store:boolean;tool_choice:string;text:{format:{strict:boolean}};input:string;max_tool_calls:number}|undefined,stored:unknown;
  const fake=async(url:RequestInfo|URL,options?:RequestInit)=>{assert.equal(url,'https://api.openai.com/v1/responses');sent=JSON.parse(options!.body as string);assert.equal((options!.headers as Record<string,string>).Authorization,'Bearer fixture-key');return Response.json(response());};
  const result=await researchTake(take,'fixture-key','test-fixture',fake as typeof fetch,async r=>{stored=r});
  assert.ok(sent);assert.equal(sent.store,false);assert.equal(sent.tool_choice,'required');assert.equal(sent.text.format.strict,true);assert.equal(sent.input,take);assert.ok(sent.max_tool_calls<=5);assert.ok(stored);assert.equal(result.report.candidates[0].symbol,'UNI');
  const invalid={...response(),status:'incomplete'};stored=undefined;
  await assert.rejects(researchTake(take,'fixture-key','test-fixture',(async()=>Response.json(invalid)) as typeof fetch,async r=>{stored=r}),/did not finish/);assert.ok(stored);
});

test('provider failures never silently return curated examples or expose credentials',async()=>{
  for(const status of [401,429,500])await assert.rejects(researchTake(take,'secret-value','test-fixture',(async()=>new Response('secret-value',{status})) as typeof fetch),(e:unknown)=>e instanceof GenerationError&&!e.message.includes('secret-value'));
  const noSearch={...response(),output:response().output.filter(x=>x.type!=='web_search_call')};
  await assert.rejects(researchTake(take,'fixture-key','test-fixture',(async()=>Response.json(noSearch)) as typeof fetch),/did not finish/);
});

test('metadata is fetched only from the fixed API host and invalid metadata fails closed',async()=>{
  let requested='';const lookup=async(url:RequestInfo|URL)=>{requested=String(url);return Response.json(coin)};
  assert.equal((await fetchCoin('uniswap',undefined,lookup as typeof fetch))?.id,'uniswap');
  assert.ok(requested.startsWith('https://api.coingecko.com/api/v3/coins/uniswap?'));
  assert.equal(await fetchCoin('../secrets',undefined,lookup as typeof fetch),null);
  assert.equal(await fetchCoin('uniswap',undefined,(async()=>Response.json({})) as typeof fetch),null);
});

test('citation verification keeps query parameters that may identify different source content',()=>{assert.equal(sourceObserved('https://example.org/page?id=wrong',[{url:'https://example.org/page?id=right'}]),false);});


test('generated theses retain only observed evidence in a report bound to the resolved basket',async()=>{
  const provider=fixtureProvider();
  provider.report.evidence={items:[{title:'A documented platform',url:'https://uniswap.org/',publisher:'Uniswap',author:null,publishedAt:null,kind:'docs',stance:'supports',relationship:'project',summary:'The official project describes its decentralized trading protocol.',relevance:'This supports the product premise, not a governance-token price target.'}],coverageNote:'Only this project source was found; broader coverage is needed.'};
  const resolved=await resolveResearch(provider,take,'fixture-evidence',async()=>coin);
  const {evidenceFingerprint}=await import('../lib/evidence/core');
  assert.equal(resolved.thesis?.research?.evidence?.items.length,1);
  assert.equal(resolved.research.evidence?.fingerprint,await evidenceFingerprint(resolved.thesis!));
  provider.sources=[];
  const withoutSources=await resolveResearch(provider,take,'fixture-evidence',async()=>coin);
  assert.equal(withoutSources.thesis,null);
});


test('AI baskets allow ten holdings total and count a funded reserve as one slot',()=>{
  const r=fixtureReport();r.candidates=Array.from({length:10},(_,i)=>({...r.candidates[0],name:`Project ${i}`,symbol:`T${i}`,coingecko_id:`token-${i}`,weight:9}));
  assert.equal(reportSchema.safeParse(r).success,false);
  r.candidates.pop();r.candidates.forEach(c=>c.weight=10);assert.equal(reportSchema.safeParse(r).success,true);
  r.reserve_weight=0;r.candidates.push({...r.candidates[0],symbol:'T9',coingecko_id:'token-9'});assert.equal(reportSchema.safeParse(r).success,true);
  r.candidates[9].weight=0;r.candidates[9].watchlist_reason='Identity pending';r.reserve_weight=10;assert.equal(reportSchema.safeParse(r).success,true);
});


test('a stablecoin-only thesis resolves with an observed issuer source and no forced risky candidates',async()=>{
 const report=fixtureReport();report.candidates=[];report.reserve_weight=100;report.category='Stables';
 const p=fixtureProvider(report);p.sources=[{url:'https://www.circle.com/usdc',title:'Circle USDC'}];
 const r=await resolveResearch(p,'Be in stables for this next week','stables',async()=>{throw new Error('No risky candidate should be queried');});
 assert.deepEqual(r.thesis?.allocations,[{symbol:'USDC',weight:100}]);
 assert.equal(tokenFit(r.thesis!,'USDC').kind,'Direct');
 p.sources=[];assert.equal((await resolveResearch(p,'Hold USDC for the next week','unverified-stables',async()=>null)).thesis,null);
});

test('stablecoin platform conviction never becomes a stablecoin holding',async()=>{
 const p=fixtureProvider();
 const r=await resolveResearch(p,'Buy the platforms behind stablecoins','platforms',async()=>coin);
 assert.deepEqual(r.thesis?.allocations,[{symbol:'cg:uniswap',weight:100}]);
});

test('a watchlist-only research report is valid but does not fabricate an exposure basket',async()=>{
 const report=fixtureReport();report.reserve_weight=0;report.candidates[0].weight=0;report.candidates[0].watchlist_reason='No verified tradable identity';
 assert.equal(reportSchema.safeParse(report).success,true);
 assert.equal((await resolveResearch(fixtureProvider(report),take,'watchlist',async()=>null)).thesis,null);
});


test('provider schema discloses text limits that would otherwise reject a completed report',()=>{
  const schema=REPORT_JSON_SCHEMA.properties as Record<string, any>;
  const report=fixtureReport();
  report.summary='x'.repeat(181);
  assert.equal(reportSchema.safeParse(report).success,false);
  assert.equal(schema.summary.maxLength,180);
  report.summary='x'.repeat(180);
  assert.equal(reportSchema.safeParse(report).success,true);
  const candidate=schema.candidates.items.properties;
  assert.equal(candidate.reason.minLength,15);
  assert.equal(candidate.risk.maxLength,500);
  assert.equal(candidate.watchlist_reason.maxLength,300);
  assert.ok(new RegExp(candidate.coingecko_id.pattern).test('bitcoin'));
  assert.equal(new RegExp(candidate.coingecko_id.pattern).test('Bitcoin'),false);
  const evidence=schema.evidence.properties;
  assert.equal(evidence.coverageNote.maxLength,700);
  assert.equal(evidence.items.items.properties.summary.maxLength,500);
  assert.ok(new RegExp(evidence.items.items.properties.publishedAt.pattern).test('2026-09-30'));
  assert.equal(new RegExp(evidence.items.items.properties.publishedAt.pattern).test('2026-09-30T00:00:00Z'),false);
});


test('metadata outages retain reviewed identities without accepting unknown IDs or ticker collisions',async()=>{
 const outage=(async()=>new Response('',{status:429})) as typeof fetch;
 const btc=await fetchCoin('bitcoin',undefined,outage);
 assert.equal(btc?.verification,'reviewed-catalog');
 assert.equal(await fetchCoin('not-a-reviewed-project',undefined,outage),null);
 assert.equal(await fetchCoin('bitcoin',undefined,(async()=>new Response('',{status:404})) as typeof fetch),null);
 assert.equal(await fetchCoin('bitcoin',undefined,(async()=>Response.json({id:'fake-bitcoin'})) as typeof fetch),null);
 for (const body of ['', '<html>not metadata</html>']) assert.equal(await fetchCoin('bitcoin',undefined,(async()=>new Response(body,{status:200})) as typeof fetch),null);
 const candidate={...fixtureReport().candidates[0],name:'Bitcoin',symbol:'BTC',coingecko_id:'bitcoin',official_url:'https://bitcoin.org/',source_url:'https://bitcoin.org/en/bitcoin-for-individuals',weight:100};
 assert.equal(checkedToken(candidate,btc!)?.key,'BTC');
 assert.equal(checkedToken({...candidate,symbol:'ETH'},btc!),null);
 assert.equal(checkedToken({...candidate,official_url:'https://bitcoin.org.attacker.example/'},btc!),null);
 const report={...fixtureReport(),reserve_weight:0,candidates:[candidate]};
 const provider={...fixtureProvider(report),sources:[{url:candidate.source_url,title:'Bitcoin'}]};
 const resolved=await resolveResearch(provider,'Bitcoin adoption will grow','outage-check',async()=>btc);
 assert.deepEqual(resolved.thesis?.allocations,[{symbol:'BTC',weight:100}]);
 assert.match(resolved.research.notes,/reviewed project catalog/);
 assert.equal(resolved.thesis?.tokens?.BTC.identitySource,'https://bitcoin.org/');
});
