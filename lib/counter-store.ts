import type {Thesis} from './data';
import {COUNTER_MODEL,generateCounter} from './counter-generation';

export type CounterRow={id:string;owner:string;model:string;prompt:string;status:string;result:string|null;error:string|null;created_at:number};
export class CounterError extends Error{constructor(message:string,public status=400){super(message);}}
export async function readCounterDraft(db:D1Database,id:string,owner:string){
  const row=await db.prepare('SELECT * FROM generations WHERE id=? AND owner=? AND model=?').bind(id,owner,COUNTER_MODEL).first<CounterRow>();
  if(!row)throw new CounterError('This counter draft is unavailable.',404);
  return row;
}
export async function savedCounterDraft(db:D1Database,id:string,owner:string):Promise<Thesis>{
  const row=await readCounterDraft(db,id,owner);
  if(row.status!=='complete'||!row.result)throw new CounterError('Generate the counter assets again before saving.',409);
  return JSON.parse(row.result).thesis as Thesis;
}
export async function createCounterDraft(db:D1Database,owner:string,id:string,source:Thesis,generate=generateCounter):Promise<CounterRow>{
  const prompt=JSON.stringify([source.id,source.version]),now=Date.now();
  const previous=await db.prepare('SELECT * FROM generations WHERE id=?').bind(id).first<CounterRow>();
  const check=(row:CounterRow)=>{
    if(row.owner!==owner||row.model!==COUNTER_MODEL)throw new CounterError('This counter draft is unavailable.',404);
    if(row.prompt!==prompt)throw new CounterError('This request belongs to another call. Start a new counter.',409);
    return row;
  };
  if(previous)return check(previous);
  const inserted=await db.prepare("INSERT OR IGNORE INTO generations(id,owner,prompt,model,status,created_at,updated_at) SELECT ?,?,?,?,'researching',?,? WHERE (SELECT COUNT(*) FROM generations WHERE owner=? AND model=? AND created_at>?)<60").bind(id,owner,prompt,COUNTER_MODEL,now,now,owner,COUNTER_MODEL,now-86400000).run();
  if(!inserted.meta.changes){
    const duplicate=await db.prepare('SELECT * FROM generations WHERE id=?').bind(id).first<CounterRow>();
    if(duplicate)return check(duplicate);
    throw new CounterError('You have reached today’s counter-draft limit. Please try again tomorrow.',429);
  }
  try{
    const thesis=await generate(source,id);
    await db.prepare("UPDATE generations SET status='complete',result=?,updated_at=? WHERE id=? AND owner=? AND model=?").bind(JSON.stringify({thesis,mode:'counter'}),Date.now(),id,owner,COUNTER_MODEL).run();
  }catch{
    await db.prepare("UPDATE generations SET status='failed',error=?,updated_at=? WHERE id=? AND owner=? AND model=?").bind('Counter assets could not be generated. Please try a new market check.',Date.now(),id,owner,COUNTER_MODEL).run();
  }
  return readCounterDraft(db,id,owner);
}
