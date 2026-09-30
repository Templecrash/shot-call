import type {Thesis} from './data';

export class TakeLifecycleError extends Error {
  constructor(message:string,public status=409){super(message);}
}
export const isTakeLive=(take:Pick<Thesis,'closedAt'|'archivedAt'>)=>!take.closedAt&&!take.archivedAt;
export const LIVE_TAKE_GUARD="NOT EXISTS(SELECT 1 FROM theses WHERE id=? AND (closed_at IS NOT NULL OR archived_at IS NOT NULL))";

export async function manageTake(db:D1Database,userId:string,thesisId:string,action:'close'|'archive'|'restore') {
  const row=await db.prepare('SELECT owner,closed_at,archived_at FROM theses WHERE id=?').bind(thesisId).first<{owner:string;closed_at:number|null;archived_at:number|null}>();
  if(!row||row.owner!==userId)throw new TakeLifecycleError('Only the creator can manage this take.',403);
  if(action==='close'){
    await db.prepare('UPDATE theses SET closed_at=COALESCE(closed_at,?) WHERE id=? AND owner=?').bind(Date.now(),thesisId,userId).run();
  }else if(action==='restore'){
    await db.prepare('UPDATE theses SET archived_at=NULL WHERE id=? AND owner=?').bind(thesisId,userId).run();
  }else{
    const result=await db.prepare("UPDATE theses SET archived_at=COALESCE(archived_at,?) WHERE id=? AND owner=? AND NOT EXISTS(SELECT 1 FROM positions WHERE thesis_id=? AND amount>0)").bind(Date.now(),thesisId,userId,thesisId).run();
    if(!result.meta.changes)throw new TakeLifecycleError('This take has open investments. Close it to new investment first; remove it once everyone has exited.');
  }
  return {ok:true};
}
