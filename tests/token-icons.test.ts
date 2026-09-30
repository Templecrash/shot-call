import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TOKENS} from '../lib/data';
import {tokenIconSources,safeRemoteIcon} from '../lib/token-icons';
import {fetchTokenIcon} from '../lib/token-icon-fetch';

test('curated identities override stale artwork without using ticker collisions',()=>{
 assert.equal(tokenIconSources({...TOKENS.LINK,image:'/coins/LINK.png'},'LINK')[0],'/coins/LINK-v2.png');
 const other={...TOKENS.LINK,coingeckoId:'different-link',image:'https://coin-images.coingecko.com/coins/images/12/small/logo.png'};
 assert.equal(tokenIconSources(other,'cg:different-link')[0],other.image);
 assert(!tokenIconSources(other,'cg:different-link').includes('/coins/LINK-v2.png'));
 assert.equal(safeRemoteIcon('https://coin-images.coingecko.com.evil.test/icon.png'),null);
 assert.equal(safeRemoteIcon('http://127.0.0.1/icon.png'),null);
});

test('metadata fallback checks identity and never forwards API credentials to the image host',async()=>{
 const calls:{url:string;init?:RequestInit}[]=[];
 const fetcher=(async(url:RequestInfo|URL,init?:RequestInit)=>{
  calls.push({url:String(url),init});
  return calls.length===1?Response.json({id:'checked-token',image:{small:'https://coin-images.coingecko.com/coins/images/1/small/token.png'}}):new Response(new Uint8Array([137,80,78,71]),{headers:{'content-type':'image/png'}});
 }) as typeof fetch;
 const result=await fetchTokenIcon('checked-token','private-demo-key',fetcher);
 assert.equal(result?.contentType,'image/png');
 assert.equal(new Headers(calls[0].init?.headers).get('x-cg-demo-api-key'),'private-demo-key');
 assert.equal(new Headers(calls[1].init?.headers).get('x-cg-demo-api-key'),null);
 assert.equal(calls[1].init?.redirect,'error');
});

test('mismatched identities, untrusted hosts and non-images never produce an icon',async()=>{
 for(const metadata of [{id:'wrong-token',image:{small:'https://coin-images.coingecko.com/a.png'}},{id:'checked-token',image:{small:'https://127.0.0.1/a.png'}}]){
  let calls=0;const fetcher=(async()=>{calls++;return Response.json(metadata)}) as typeof fetch;
  assert.equal(await fetchTokenIcon('checked-token',undefined,fetcher),null);assert.equal(calls,1);
 }
 let calls=0;const fetcher=(async()=>++calls===1?Response.json({id:'checked-token',image:{small:'https://coin-images.coingecko.com/a.png'}}):new Response('<html/>',{headers:{'content-type':'text/html'}})) as typeof fetch;
 assert.equal(await fetchTokenIcon('checked-token',undefined,fetcher),null);
});

test('oversized streamed images are refused even without a content-length header',async()=>{
 let calls=0;const fetcher=(async()=>++calls===1?Response.json({id:'checked-token',image:{small:'https://coin-images.coingecko.com/a.png'}}):new Response(new Uint8Array(1024*1024+1),{headers:{'content-type':'image/png'}})) as typeof fetch;
 assert.equal(await fetchTokenIcon('checked-token',undefined,fetcher),null);
});
