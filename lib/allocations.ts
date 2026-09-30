// Stablecoins are a thesis exposure only when the author explicitly wants to
// hold them. A thesis about stablecoin platforms is a different investment.
const stableAsset = '(?:stables?|stable[ -]?coins?|usdc|usdt|dai|usds|usde|cash)';
export function wantsStablecoins(body: string): boolean {
  const text = body.toLowerCase().replace(/[’]/g, "'");
  const negative = new RegExp(`\\b(?:avoid|without|exclude|remove|no|sell|exit|leave|out of|do not|don't|not)\\s+(?:(?:want|hold|holding|buy|be in|stay in|any|all|the)\\s+)*${stableAsset}\\b`);
  if (negative.test(text)) return false;
  const directHolding = `\\b(?:be|stay|sit|remain|wait|park|hold|holding|keep|move|rotate|switch|allocate|go|buy|want)\\s+(?:(?:my|our|the|all|some|portfolio|capital|money|funds|dollars?|usd|in|into|to|only|a|bit|of|it|\\d+%?)\\s+){0,8}${stableAsset}\\b(?![ -](?:platform|issuer|infrastructure|protocol|rails|ecosystem|business|compan|stock))`;
  return new RegExp(directHolding).test(text)
    || new RegExp(`^\\s*${stableAsset}(?:\\s+only|\\s+for\\s+(?:this|the|next|one|a)|\\s+until|\\s*$)`).test(text);
}

export function isStablecoin(symbol: string): boolean {
  return /^(?:USDC|USDT|DAI|USDS|USDE|FDUSD|TUSD|PYUSD|FRAX|GUSD|LUSD|SUSD|USDD)$/i.test(symbol);
}

// Preserve relative exposure and direction; distribute rounding cents by the
// largest remainder so the allocation always totals exactly 100%.
export function fullExposure<T extends { weight: number }>(rows: readonly T[]): T[] {
  const positive = rows.filter(row => Number.isFinite(row.weight) && row.weight > 0);
  const sum = positive.reduce((total, row) => total + row.weight, 0);
  if (!sum) return [];
  const scaled = positive.map((row, index) => ({row, index, exact: row.weight / sum * 100}));
  const result = scaled.map(({row, exact}) => ({...row, weight: Math.floor(exact)}));
  const remainder = 100 - result.reduce((total, row) => total + row.weight, 0);
  const order = [...scaled].sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || a.index - b.index);
  for (let i = 0; i < remainder; i++) result[order[i].index].weight++;
  return result;
}
