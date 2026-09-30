import {readExecutionState,executionAllocations,hasPerps} from './creator-execution';
import type {Allocation, Position, Thesis} from './data';
import {isStablecoin} from './allocations';
import {tokenFor} from './token-catalog';
import type {PerpCoverage} from './perps';
import {polymarketFor} from './polymarket';

export type ExposureKind = 'tokens'|'stables'|'stocks'|'shorts'|'prediction'|'perps'|'collateral';
export type ExposureGroup = {kind:ExposureKind;title:string;description:string;allocations:Allocation[];weight:number};
export const SHARED_CASH = '__shared_cash_collateral__';
export type ExecutionPreview = {mode:'spot'|'perps'|'mixed';keys:readonly string[];allocations?:Allocation[]};
const descriptions:Record<ExposureKind,{title:string;description:string}> = {
  tokens:{title:'Tokens',description:'Own the tokens at 1×. Gains and losses follow each token’s price; there is no leverage liquidation.'},
  stables:{title:'Stablecoins',description:'Dollar-pegged token exposure. No automatic yield; issuer, custody and depeg risk remain.'},
  stocks:{title:'Tokenized stocks',description:'LONG gains when the underlying rises; SHORT gains when it falls. Shorts here are 1× simulated collateral, not inverse tokens or live borrowed positions.'},
  shorts:{title:'Short token positions',description:'1× simulated short exposure: gains when token prices fall, losses when they rise. These are not token holdings or verified perp orders.'},
  prediction:{title:'Polymarket',description:'Buy the selected YES or NO outcome. Winning shares settle at $1 and losing shares at $0 under the external market’s rules. Prices and resolution are separate from token returns; no automatic event settlement here.'},
  perps:{title:'Perpetuals',description:'Creator-selected LONG or SHORT derivatives on Hyperliquid. Weights allocate isolated collateral; notional shows the leveraged exposure. Each leg can liquidate independently. Funding is excluded from this simulation.'},
  collateral:{title:'Cash collateral',description:'These weights stay in cash because no perp is used for the listed asset. No token is held. Cash still backs the take’s shared margin and can cover losses; it is not a protected reserve.'},
};

// Execution takes precedence over asset eligibility: a spot holding must never
// become a perp merely because the underlying has a listed market.
export function exposureGroups(thesis:Thesis,execution?:ExecutionPreview):ExposureGroup[] {
  const grouped = new Map<ExposureKind,Allocation[]>();
  for(const allocation of execution?.allocations??thesis.allocations){
    const token=tokenFor(thesis,allocation.symbol);
    const kind:ExposureKind=execution?.mode==='perps'
      ? execution.keys.includes(allocation.symbol)?'perps':'collateral'
      : execution?.mode!=='spot'&&allocation.execution==='perps'?'perps'
      : token.instrument==='prediction'?'prediction'
      : token.instrument==='stock'?'stocks'
      : allocation.side==='short'?'shorts'
      : isStablecoin(token.symbol)?'stables':'tokens';
    grouped.set(kind,[...(grouped.get(kind)||[]),allocation]);
  }
  return (['tokens','stables','stocks','shorts','perps','prediction','collateral'] as const)
    .filter(kind=>grouped.has(kind))
    .map(kind=>({...descriptions[kind],...(kind==='perps'&&execution?.mode==='perps'?{description:'Legacy LONG perps with shared collateral across this take. Unsupported weights stay in cash and also back the margin. Funding is excluded.'}:{}),kind,allocations:grouped.get(kind)!,weight:grouped.get(kind)!.reduce((sum,a)=>sum+(Number.isFinite(a.weight)?a.weight:0),0)}));
}

export function positionExecution(position?:Position):ExecutionPreview|undefined {
  const frozen=readExecutionState(position?.executionState);
  if(frozen)return {mode:'mixed',keys:frozen.legs.filter(l=>l.mode==='perps').map(l=>l.symbol),allocations:executionAllocations(frozen)};
  if(!position)return undefined;
  if(position.executionMode!=='perps')return {mode:'spot',keys:[]};
  let allocations:Allocation[]=[];
  try{const rows:unknown=JSON.parse(position.perpMarkets||'[]');if(Array.isArray(rows))allocations=rows.flatMap(row=>row&&typeof row.key==='string'&&Number.isFinite(row.weight)&&row.weight>0&&row.weight<=100?[{symbol:row.key,weight:row.weight}]:[]);}catch{/* Unknown legs remain cash, never inferred from current availability. */}
  const sum=allocations.reduce((n,a)=>n+a.weight,0);
  if(sum>100||new Set(allocations.map(a=>a.symbol)).size!==allocations.length)allocations=[];
  const keys=allocations.map(a=>a.symbol),cash=100-allocations.reduce((n,a)=>n+a.weight,0);
  if(cash>0)allocations.push({symbol:SHARED_CASH,weight:cash});
  return {mode:'perps',keys,allocations};
}

export type PositionAssessment = {route:string;reason:string;alternative:string;hedge:string;review:string;hedgeLeg?:{key:string;symbol:string;weight:number};sources:{label:string;url:string}[]};
export function assessPosition(thesis:Thesis,coverage:PerpCoverage|null):PositionAssessment {
  const positive=thesis.allocations.filter(a=>a.weight>0),groups=exposureGroups({...thesis,allocations:positive});
  const onlyStables=positive.length>0&&positive.every(a=>isStablecoin(tokenFor(thesis,a.symbol).symbol)&&a.side!=='short');
  const predictions=positive.filter(a=>tokenFor(thesis,a.symbol).instrument==='prediction');
  const shorts=positive.filter(a=>a.side==='short'&&tokenFor(thesis,a.symbol).instrument!=='prediction');
  const stableSources=[{label:'USDC reserves',url:'https://www.circle.com/transparency'}];
  const perpSources=[{label:'Funding',url:'https://hyperliquid.gitbook.io/hyperliquid-docs/trading/funding'},{label:'Margin & liquidation',url:'https://hyperliquid.gitbook.io/hyperliquid-docs/trading/liquidations'}];
  if(onlyStables)return {route:'Hold dollar exposure at 1×',reason:'This call is about waiting for a better entry. Holding the selected stablecoins expresses that view without adding market direction.',alternative:'A yield product would add a separate protocol or counterparty exposure. This take does not earn automatic yield.',hedge:'No directional hedge suggested. A crypto long or short would change the cash thesis. Diversifying issuer and custody exposure could reduce a single point of failure, but another token from the same issuer is not issuer diversification.',review:'Define your re-entry trigger and review date. A one-week call does not automatically sell after seven days.',sources:stableSources};
  if(predictions.length){
    const hormuz=predictions.find(a=>polymarketFor(thesis,a.symbol));
    const oil=positive.filter(a=>['BNOON','USOON'].includes(a.symbol));
    const sameView=!!hormuz&&oil.length>0&&oil.every(a=>(a.side==='short')===(hormuz.side!=='short'));
    return {route:groups.length>1?'Keep the event and price legs separate':'Use the exact event contract',reason:'Event shares express the defined outcome and deadline. Token or stock legs express price moves. Their allocations have different payoff rules and should be sized independently.',alternative:'An event can resolve correctly while a related asset moves against the call. The contract question is the exposure, not a general news headline.',hedge:sameView?'The oil and event legs back the same view; neither hedges the other. Reduce the oil allocation to limit price exposure, or reduce the event stake to limit deadline risk. Buying the opposite event side offsets that contract but also reduces its potential profit.':'Buying the opposite side of the same event offsets that contract, but reduces its potential profit and does not hedge unrelated token-price risk. Reduce a price leg to limit its separate exposure.',review:hormuz?`${polymarketFor(thesis,hormuz.symbol)!.rules} Stock shorts are paper-only; verify borrowing, fees and liquidity before any external implementation.`:'Check the exact market rules, deadline, tradability and settlement before committing. No external orders are placed here.',sources:[{label:'Outcome settlement',url:'https://help.polymarket.com/en/articles/13364518-how-are-prediction-markets-resolved'},...(hormuz?[{label:'Market rules',url:polymarketFor(thesis,hormuz.symbol)!.url}]:[])]};
  }
  if(hasPerps(thesis))return {route:'Use the creator’s spot and perp allocation',reason:'Each selected perp has its own direction, leverage and isolated collateral. Spot legs remain token holdings at 1×.',alternative:'Choose Spot or Perp under each eligible asset. Only identity-matched Hyperliquid markets are accepted; unavailable markets cannot be saved as perps.',hedge:'A short perp can offset matching long exposure. Check each leg’s dollar notional: equal collateral at different leverage does not create equal exposure. Funding and liquidation risk remain.',review:'Publish take-profit stages and a basket stop loss. Investors follow this saved configuration; they cannot raise leverage independently.',sources:perpSources};
  if(shorts.length)return {route:'Use explicit short exposure',reason:'Buying these tokens outright would take the opposite view. The current basket is a 1× paper simulation of directed shorts.',alternative:'A real implementation needs verified borrow availability or a matching short derivative for each asset. A listing of the spot token alone does not establish either route.',hedge:'Reducing or covering part of a short is the most direct way to reduce its upside-squeeze exposure. A long in another token may not offset it; no cross-token hedge ratio has been measured.',review:'Size by dollars of short exposure, separately from posted collateral. Publish invalidation and staged-cover targets; these paper shorts omit real borrow and funding costs.',sources:perpSources};
  const wantsPerps=/\b(?:leveraged?\s+long|long\s+(?:\w+\s+)?perp|(?:want|use|via|with)\b.{0,35}\b(?:leverage|perpetual))/i.test(thesis.body)&&!/(?:no|avoid|without)\s+(?:leverage|perps|perpetual)/i.test(thesis.body);
  const supported=coverage?.legs.filter(l=>l.weight>0)||[];
  const full=!!coverage&&coverage.weight>=positive.reduce((n,a)=>n+a.weight,0);
  const hedgeLeg=[...supported].sort((a,b)=>b.weight-a.weight)[0];
  return {
    route:wantsPerps&&full?'Perps fit the amplified long call':'Spot at 1× is the simplest expression',
    reason:wantsPerps&&full?'Verified perp markets cover this basket and match the requested amplified long. Select perps and leverage in the creator setup and review liquidation estimates before publishing.':'Owning the selected tokens preserves their relative weights without recurring funding or a margin liquidation threshold.',
    alternative:supported.length?`${coverage!.weight}% of this basket has verified Hyperliquid perps, up to ${coverage!.maxLeverage}× in this app. ${full?'Perps replace the spot holdings; they are not an extra layer of tokens.':'Unsupported assets stay spot when other legs use perps.'}`:coverage?'No matching perp route is verified for this basket. Keep spot exposure rather than substituting unrelated contracts.':'Perp availability is unverified while markets are loading or unavailable. Spot is the only assessed route until a valid snapshot arrives.',
    hedge:hedgeLeg&&!wantsPerps?`A partial SHORT ${hedgeLeg.symbol} perp could offset part of the matching long token leg. It reduces both upside and downside, adds funding and liquidation risk, and does not hedge the other tokens. A separate offset requires its own collateral; changing the long row to a short would replace that exposure, not add a hedge.`:'Reduce position size or leverage to lower exposure directly. A stop loss is an exit rule, not a hedge or a guaranteed fill. No cross-token hedge ratio has been measured.',
    review:wantsPerps?'Use allocated collateral and leveraged notional as separate numbers. Review funding, market depth, invalidation and liquidation distance; no optimal leverage can be inferred from the call alone.':'Publish the condition that invalidates the call and your profit-taking schedule. Market depth, spread and slippage have not been measured, so this assessment does not claim the cheapest execution venue.',
    hedgeLeg:!wantsPerps&&hedgeLeg?{key:hedgeLeg.key,symbol:hedgeLeg.symbol,weight:hedgeLeg.weight}:undefined,
    sources:perpSources,
  };
}
