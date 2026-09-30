import type { Allocation, Thesis } from './data';

export type CounterRoute = {
  allocation: Allocation;
  kind: 'direct' | 'outcome' | 'alternative';
  reason: string;
  source: string;
  question?: string;
  price?: number;
};
export type CounterPlan = {
  checkedAt: number;
  coveredWeight: number;
  routes: CounterRoute[];
  omitted: {symbol:string;reason:string}[];
  notes: string[];
};

export type CounterStrategy = {
  sourceId: string;
  sourceVersion: number;
  sourceTitle: string;
  generationId?: string;
  plan?: CounterPlan;
  betThesisId?: string;
  betTitle?: string;
  betSide?: 'right' | 'wrong';
};

export function counterMetadata(source: Thesis): CounterStrategy {
  return {sourceId:source.id,sourceVersion:source.version,sourceTitle:source.title};
}

export function reverseAllocations(source: Thesis): Allocation[] {
  return source.allocations.map(a => a.symbol === 'USDC'
    ? { symbol: a.symbol, weight: a.weight }
    : { ...a, side: a.side === 'short' ? 'long' : 'short' });
}

// Derive attribution on the server.
export function validateCounter(source: Thesis, version: number, allocations: Allocation[]): CounterStrategy {
  if (source.version !== version) throw new Error('The original take changed. Create a fresh counter strategy.');
  const reversed = reverseAllocations(source);
  if (!allocations.some(a => a.symbol !== 'USDC' && a.weight > 0))
    throw new Error('A counter needs at least one reversed position.');
  for (const a of allocations) {
    const original = reversed.find(b => b.symbol === a.symbol);
    if (!original || (a.symbol === 'USDC' ? a.side === 'short' : a.side !== original.side))
      throw new Error('Counter strategies must reverse the original positions. Adjust weights or remove a position.');
  }
  return counterMetadata(source);
}

export function buildCounterStrategy(source: Thesis, id: string, now = Date.now()): Thesis {
  const counter=counterMetadata(source);
  const title=`Against ${source.title}`;
  return {
    id, title: title.slice(0, 90),
    body: `I take the opposite side of “${source.title}”. I expect the original investment thesis to fail, so I reverse its positions. Original conviction: ${source.body}`.slice(0, 1500),
    summary: `The countertake to ${source.title}. Reversed positions, same ecosystem.`.slice(0, 180),
    category: source.category, author: 'You', allocations: reverseAllocations(source),
    createdAt: now, version: 1, parent: source.id, counter,
    engine: 'curated', visibility: 'private', tokens: source.tokens,
    evidenceNote: 'Positions are reversed from the original take, not newly researched by AI. Review the original sources and write your own counterargument.',
    risk: 'Demo exposure at 1×. Short positions gain when the underlying falls and lose when it rises; losses are capped at this simulated position’s value. Cash stays fixed. Borrowing costs and funding are excluded. External outcome shares are illustrative and do not automatically settle.',
  };
}
