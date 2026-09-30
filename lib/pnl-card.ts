export type PnlCardData = {
  title:string;
  kind:'trade'|'portfolio';
  label:string;
  status:string;
  profit:number|null;
  percent:number;
  cost:number|null;
  costLabel:string;
  realized:number|null;
  unrealized:number|null;
  execution:string;
  artwork:string;
  thesisPath:string|null;
  creator:{name:string;handle:string|null;avatarUrl:string|null;twitterUrl:string|null};
  asOf:number;
  tradeAt:number|null;
  amountsHidden:boolean;
};
export function pnlPercent(value:number){return `${value>0?'+':value<0?'−':''}${Math.abs(value).toFixed(2)}%`;}
export function pnlMoney(value:number){return `${value>=0.005?'+':value<=-0.005?'−':''}${new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Math.abs(value))}`;}
export async function pnlFingerprint(card:PnlCardData){
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(card)));
  return [...new Uint8Array(hash)].map(v=>v.toString(16).padStart(2,'0')).join('');
}
