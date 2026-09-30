import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {database} from '@/db/raw';
import {suggestExitStrategy} from '@/lib/ai/exit-strategy';
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const schema=z.object({id:z.string().uuid(),mode:z.enum(['basket','tokens']),title:z.string().trim().min(3).max(90),body:z.string().trim().min(8).max(1500),allocations:z.array(z.object({symbol:z.string().min(1).max(110),weight:z.number().int().min(0).max(100),side:z.enum(['long','short']).optional()})).min(1).max(10).refine(a=>a.reduce((n,x)=>n+x.weight,0)===100&&new Set(a.map(x=>x.symbol)).size===a.length)});
type Row={owner:string;request_hash:string;status:string;result:string|null;error:string|null;updated_at:number};
const result=(row:Row)=>row.result?json({plan:JSON.parse(row.result)}):json({error:row.error||(Date.now()-row.updated_at>120000?'The suggestion expired. You can start a new request.':'Your suggestion is still being prepared.'),pending:row.status==='generating'&&Date.now()-row.updated_at<=120000},row.status==='generating'&&Date.now()-row.updated_at<=120000?202:422);
export async function GET(req:Request){const user=await getChatGPTUser();if(!user)return json({error:'Sign in to recover your suggestion.'},401);const id=new URL(req.url).searchParams.get('id');if(!z.string().uuid().safeParse(id).success)return json({error:'Invalid suggestion.'},400);const row=await database().prepare('SELECT * FROM exit_suggestions WHERE id=? AND owner=?').bind(id,user.userId).first<Row>();return row?result(row):json({error:'This suggestion is unavailable.'},404);}
export async function POST(req:Request){
 let started=false,id:string|undefined,owner:string|undefined;
 try{
  if(req.headers.get('origin')&&new URL(req.headers.get('origin')!).origin!==new URL(req.url).origin)return json({error:'Invalid origin.'},403);
  const user=await getChatGPTUser();if(!user)return json({error:'Sign in to suggest an exit strategy.'},401);
  const b=schema.parse(await req.json()),db=database();id=b.id;owner=user.userId;
  const hash=JSON.stringify([b.title,b.body,b.allocations,b.mode]);
  const previous=await db.prepare('SELECT * FROM exit_suggestions WHERE id=?').bind(id).first<Row>();
  if(previous){if(previous.owner!==owner)return json({error:'This suggestion is unavailable.'},404);if(previous.request_hash!==hash)return json({error:'This request belongs to a different draft.'},409);return result(previous);}
  if(!env.OPENAI_API_KEY)return json({error:'AI suggestions are temporarily unavailable. You can set and save your exit targets manually.'},503);
  const now=Date.now(),inserted=await db.prepare("INSERT OR IGNORE INTO exit_suggestions(id,owner,request_hash,status,created_at,updated_at) SELECT ?,?,?,'generating',?,? WHERE NOT EXISTS(SELECT 1 FROM exit_suggestions WHERE owner=? AND status='generating' AND updated_at>?) AND (SELECT COUNT(*) FROM exit_suggestions WHERE owner=? AND created_at>?)<20").bind(id,owner,hash,now,now,owner,now-120000,owner,now-86400000).run();
  if(!inserted.meta.changes)return json({error:'Finish the current suggestion first, or try again after the daily limit resets.'},429);
  started=true;const plan=await suggestExitStrategy(b,b.mode,env.OPENAI_API_KEY,id);
  await db.prepare("UPDATE exit_suggestions SET status='complete',result=?,updated_at=? WHERE id=? AND owner=?").bind(JSON.stringify(plan),Date.now(),id,owner).run();
  return json({plan});
 }catch(e){const error=e instanceof z.ZodError?'Check the thesis and its token weights.':e instanceof Error&&e.name==='TimeoutError'?'The AI suggestion timed out. Check its saved result before trying again.':e instanceof Error&&/^(AI suggestions|The AI|The suggestion|Exit targets|Each exit|Targets must)/.test(e.message)?e.message:'The suggestion could not finish. Your manual targets are still here.';
  if(started&&id&&owner)try{await database().prepare("UPDATE exit_suggestions SET status='failed',error=?,updated_at=? WHERE id=? AND owner=?").bind(error,Date.now(),id,owner).run();}catch{/* Keep the request recoverable without automatically repeating a paid call. */}
  return json({error},e instanceof z.ZodError?400:502);
 }
}
