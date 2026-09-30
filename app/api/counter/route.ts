import {z} from 'zod';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {database} from '@/db/raw';
import {readThesis} from '@/lib/thesis-store';
import {CounterError,createCounterDraft,readCounterDraft,type CounterRow} from '@/lib/counter-store';

const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const schema=z.object({id:z.string().uuid(),sourceId:z.string().min(1).max(80),sourceVersion:z.number().int().min(1)});
function result(row:CounterRow){
  if(row.status==='complete'&&row.result)return json({...JSON.parse(row.result),status:'complete',generationId:row.id});
  if(row.status==='failed'||Date.now()-row.created_at>90000)return json({error:row.error||'This market check expired. Start a new counter call.',status:'failed'},422);
  return json({status:'researching',generationId:row.id},202);
}
function failure(e:unknown){return json({error:e instanceof CounterError?e.message:e instanceof z.ZodError?'Check the counter call request.':'Counter drafts are temporarily unavailable.'},e instanceof CounterError?e.status:e instanceof z.ZodError?400:503);}
export async function GET(req:Request){
  try{const user=await getChatGPTUser();if(!user)return json({error:'Sign in to recover your counter call.',code:'sign_in_required'},401);
    const id=z.string().uuid().parse(new URL(req.url).searchParams.get('id'));
    return result(await readCounterDraft(database(),id,user.userId));
  }catch(e){return failure(e);}
}
export async function POST(req:Request){
  try{
    if(req.headers.get('origin')&&new URL(req.headers.get('origin')!).origin!==new URL(req.url).origin)return json({error:'Invalid origin.'},403);
    const user=await getChatGPTUser();if(!user)return json({error:'Sign in to generate your counter call.',code:'sign_in_required'},401);
    const b=schema.parse(await req.json()),db=database(),source=await readThesis(db,b.sourceId,user.userId);
    if(!source)return json({error:'The original call is unavailable.'},404);
    if(source.version!==b.sourceVersion)return json({error:'The original call changed. Refresh it before creating a counter.'},409);
    return result(await createCounterDraft(db,user.userId,b.id,source));
  }catch(e){return failure(e);}
}
