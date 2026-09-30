import type {Thesis} from './data';
import {validateExitPlan,startExitState} from './exit-plan';
import {isTakeLive} from './take-lifecycle';
export class ExitPlanError extends Error{constructor(message:string,public status=409){super(message);}}
export async function saveCreatorExits(db:D1Database,userId:string,thesis:Thesis,value:unknown,previousPlanId:string|null){
 if(thesis.owner!==userId||thesis.example)throw new ExitPlanError('Only the creator can change this exit plan.',403);
 if(!isTakeLive(thesis))throw new ExitPlanError('This take is closed. Create a new version to change its plan.');
 const plan=value===null?null:{...validateExitPlan(value,thesis),id:crypto.randomUUID(),updatedAt:Date.now()};
 const update=await db.prepare("UPDATE theses SET payload=json_set(payload,'$.exitPlan',json(?)) WHERE id=? AND owner=? AND closed_at IS NULL AND archived_at IS NULL AND COALESCE(json_extract(payload,'$.exitPlan.id'),'')=?").bind(JSON.stringify(plan),thesis.id,userId,previousPlanId||'').run();
 if(!update.meta.changes)throw new ExitPlanError('The exit plan changed. Refresh before saving again.');
 return {ok:true};
}
export async function adoptCreatorExits(db:D1Database,userId:string,thesis:Thesis,planId:string){
 const p=await db.prepare('SELECT amount,invested,execution_mode,execution_state FROM positions WHERE user_id=? AND thesis_id=?').bind(userId,thesis.id).first<{amount:number;invested:number;execution_mode:string;execution_state:string|null}>();
 if(p?.execution_state)throw new ExitPlanError('This position follows its saved creator plan. Close and reopen to adopt a new version.');
 if(!p?.amount)throw new ExitPlanError('Buy this take before following its exit plan.');
 if(planId!==thesis.exitPlan?.id||!thesis.exitPlan)throw new ExitPlanError('Refresh and review the latest creator exit plan.');
 if(p.execution_mode==='perps'&&thesis.exitPlan.mode==='tokens')throw new ExitPlanError('Token-by-token exits apply to spot positions. Perps support basket exits.');
 const state=startExitState(validateExitPlan(thesis.exitPlan,thesis),thesis,p.amount,p.invested);
 // Explicit consent freezes targets. Adoption cannot reset consumed stages or
 // redistribute a position that already has token-specific holdings.
 const adopted=await db.batch([
  db.prepare("UPDATE positions SET exit_state=?,take_profit=NULL WHERE user_id=? AND thesis_id=? AND amount=? AND invested=? AND exit_state IS NULL AND (?=1 OR EXISTS(SELECT 1 FROM theses WHERE id=? AND json_extract(payload,'$.exitPlan.id')=?))").bind(JSON.stringify(state),userId,thesis.id,p.amount,p.invested,thesis.example?1:0,thesis.id,planId),
  db.prepare('UPDATE accounts SET revision=revision+1 WHERE user_id=?').bind(userId)
 ]);
 if(!adopted[0].meta.changes)throw new ExitPlanError('An exit schedule is already active or your position changed. Keep the saved schedule or close and reopen to use the new plan.');
 return {ok:true};
}
