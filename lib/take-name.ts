import {wantsStablecoins} from './allocations';
import {VITALIK_PORTFOLIO_PROMPT} from './vitalik-portfolio';
export function nameTake(body:string,category:string):string{
 if(VITALIK_PORTFOLIO_PROMPT.test(body))return 'In Vitalik We Trust';
 if(wantsStablecoins(body))return /week|7 days|seven days/i.test(body)?'A Week on the Sidelines':'The Stablecoin Pause';
 if(/\b(?:short(?:ing)?|bearish|bet against)\b[\s\S]*\b(?:gaming|gamefi|game tokens?)\b|\b(?:gaming|gamefi|game tokens?)\b[\s\S]*\b(?:short(?:ing)?|bearish)\b/i.test(body))return 'Game Over';
 const names:[RegExp,string][]=[[/hormuz|short(?:ing)?\s+(?:crude\s+)?oil/i,'Hormuz, Reopened'],[/pok[eé]mon|trading[ -]cards?|\brepacks?\b|repackaging/i,'Pokémon, Repacked'],[/\brobotics\b|\brobots?\b|autonomous[ -]machines?|fabric protocol|\bpeaq\b|\bauki\b|geodnet/i,'Robots Need Rails'],[/gacha|gotcha|collectible|trading.cards/i,'The Collector Economy'],[/privacy|monero|zcash/i,'Privacy Unbound'],[/launchpad|token.launch|pump.fun/i,'The Launchpad Thesis'],[/stock.token|tokenized.equit|tokenised.equit/i,'Wall Street, Rewired'],[/majors|bottom.for|bottom.*major/i,'The Majors Revival'],[/ethereum|\beth\b|vitalik/i,'Ethereum’s Next Chapter'],[/bitcoin|\bbtc\b|hard.money|scarcity/i,'The Scarcity Thesis'],[/\bai\b|compute|intelligence|gpu/i,'The Compute Frontier'],[/gaming|games|play.to.earn/i,'The Ownership Game'],[/tokeniz|tokenis|real.world|\brwa\b/i,'The Onchain Shift'],[/bottom|majors/i,'The Majors Revival'],[/solana|\bsol\b/i,'The Solana Thesis']];
 const match=names.find(([re])=>re.test(body));if(match)return match[1];
 const skip=new Set('i im am think believe that the this is are will going to be a an on in of for it about big bullish bearish very really think my take its we they should could would have has and worth investing only next want'.split(' '));
 const words=body.replace(/https?:\/\/\S+/g,'').match(/[A-Za-z0-9][A-Za-z0-9’-]*/g)?.filter(w=>!skip.has(w.toLowerCase())).slice(0,3)||[];
 const subject=words.map(w=>w===w.toUpperCase()?w:w[0].toUpperCase()+w.slice(1).toLowerCase()).join(' ');
 return subject?`${subject} Thesis`.slice(0,70):category!=='Custom'?`${category} Reimagined`:'A New Conviction';
}

export function categoryForTake(body:string):string {
 if(wantsStablecoins(body))return 'Stables';
 const categories:[RegExp,string][]=[[/hormuz|short(?:ing)?\s+(?:crude\s+)?oil/i,'Geopolitics & oil'],[/pok[eé]mon|trading[ -]cards?|\brepacks?\b|repackaging/i,'Cards & repacks'],[/\brobotics\b|\brobots?\b|autonomous[ -]machines?|fabric protocol|\bpeaq\b|\bauki\b|geodnet/i,'Robotics'],[/gacha|gotcha|collectible/i,'Gacha & collectibles'],[/privacy|monero|zcash/i,'Privacy'],[/launchpad|token.launch|pump.fun/i,'Launchpads'],[/stock.token|tokenized.equit|tokenised.equit/i,'Stock tokens'],[/majors|bottom.for|bottom.*major/i,'Majors'],[/ethereum|\beth\b|vitalik/i,'Ethereum'],[/\bai\b|compute|intelligence|gpu/i,'AI & compute'],[/gaming|games|play.to.earn/i,'Gaming'],[/tokeniz|tokenis|real.world|\brwa\b/i,'Real-world assets'],[/bitcoin|\bbtc\b|scarcity/i,'Macro']];
 return categories.find(([pattern])=>pattern.test(body))?.[1]||'Custom';
}
