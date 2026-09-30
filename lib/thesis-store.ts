import { EXAMPLES, type Thesis } from "./data";
import {fullExposure,wantsStablecoins} from "./allocations";
export function storedThesis(row:{payload:string;owner:string;visibility?:string;artwork_id?:string|null;artwork_status?:string|null;closed_at?:number|null;archived_at?:number|null}):Thesis{
 const thesis:Thesis={...JSON.parse(row.payload),owner:row.owner,visibility:row.visibility==='private'?'private':'public',closedAt:row.closed_at||undefined,archivedAt:row.archived_at||undefined,artworkId:row.artwork_id||undefined,artworkStatus:row.artwork_status||undefined};
 if(thesis.counter){const {sourceId,sourceVersion,sourceTitle,generationId,plan}=thesis.counter;thesis.counter={sourceId,sourceVersion,sourceTitle,...(generationId?{generationId,plan}:{})};thesis.evidenceNote=thesis.evidenceNote?.replace(' A prediction bet uses the original pool’s frozen basket, independently of this strategy’s weights.','');}
 // Older saved drafts also received the former automatic USDC reserve. Apply
 // the new allocation policy consistently on reads; ledgers and frozen bet
 // snapshots stay untouched, and rollback can restore the original payload.
 if(!thesis.executionVersion&&Array.isArray(thesis.allocations)&&typeof thesis.body==='string'&&!wantsStablecoins(thesis.body)&&thesis.allocations.some(a=>a.symbol==='USDC')){
  const exposure=thesis.allocations.filter(a=>a.symbol!=='USDC'&&a.weight>0);
  if(exposure.length)return {...thesis,storageVersion:thesis.version,version:thesis.version+1,allocations:fullExposure(exposure),research:thesis.research?{...thesis.research,allocationRationale:'Fully allocated across the thesis holdings; the former automatic USDC reserve has been removed.'}:undefined};
 }
 return thesis;
}
export async function readThesis(db:D1Database,id:string,userId?:string):Promise<Thesis|undefined>{
 const example=EXAMPLES.find(t=>t.id===id);if(example)return {...example,visibility:'public'};
 const row=await db.prepare("SELECT t.payload,t.owner,t.visibility,t.artwork_id,t.closed_at,t.archived_at,a.status AS artwork_status FROM theses t LEFT JOIN take_identities a ON a.id=t.artwork_id WHERE t.id=? AND (t.visibility='public' OR t.owner=?)").bind(id,userId||'').first<{payload:string;owner:string;visibility:string;artwork_id:string|null;artwork_status:string|null;closed_at:number|null;archived_at:number|null}>();
 return row?storedThesis(row):undefined;
}
export async function publicThesis(db:D1Database,id:string){const t=await readThesis(db,id);return t?.visibility==='private'?undefined:t;}
