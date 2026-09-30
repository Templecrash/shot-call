import {env} from 'cloudflare:workers';
import {z} from 'zod';
import {database} from '@/db/raw';
import {getChatGPTUser} from '@/app/chatgpt-auth';
import {nameTake,describeTake,imagePrompt,generateTakeImage,type TakeIdentity} from '@/lib/take-identity';
type Row={id:string;owner:string;thesis_id:string;body:string;category:string;title:string;status:string;error:string|null;request_hash:string;created_at:number;updated_at:number};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const publicIdentity=(r:Row):TakeIdentity=>({id:r.id,thesisId:r.thesis_id,body:r.body,category:r.category,title:r.title,status:(r.status==='generating'&&Date.now()-r.updated_at>300000?'failed':r.status) as TakeIdentity['status'],error:r.status==='generating'&&Date.now()-r.updated_at>300000?'Image generation expired. You can explicitly retry with a new request.':r.error});
export async function GET(req:Request){
 const params=new URL(req.url).searchParams,id=params.get('id'),thesisId=params.get('thesisId');
 if(!id&&!thesisId)return json({ready:!!env.OPENAI_API_KEY});
 const user=await getChatGPTUser();if(!user)return json({error:'Sign in to recover your take image.'},401);
 try{if(thesisId&&!id){const saved=await database().prepare('SELECT * FROM take_identities WHERE thesis_id=? AND owner=? ORDER BY created_at DESC LIMIT 1').bind(thesisId,user.userId).first<Row>();return json({identity:saved?publicIdentity(saved):null});}const row=await database().prepare('SELECT * FROM take_identities WHERE id=? AND owner=?').bind(id,user.userId).first<Row>();return row?json(publicIdentity(row),row.status==='generating'&&Date.now()-row.updated_at<=300000?202:200):json({error:'This image draft is unavailable.'},404);}catch{return json({error:'Image drafts are temporarily unavailable.'},503);}
}
const schema=z.object({id:z.string().uuid(),thesisId:z.string().uuid(),body:z.string().trim().min(8).max(1500),category:z.string().min(1).max(40),retry:z.boolean().default(false)});
export async function POST(req:Request){
 let started=false,identityId:string|undefined,owner:string|undefined;
 try{
  if(req.headers.get('origin')&&new URL(req.headers.get('origin')!).origin!==new URL(req.url).origin)return json({error:'Invalid origin.'},403);
  const user=await getChatGPTUser();if(!user)return json({error:'Sign in to generate a take image.'},401);
  const b=schema.parse(await req.json()),db=database();owner=user.userId;identityId=b.id;
  const requestHash=JSON.stringify([b.thesisId,b.body,b.category]);
  const existing=await db.prepare('SELECT * FROM take_identities WHERE id=?').bind(b.id).first<Row>();
  if(existing){if(existing.owner!==owner)return json({error:'This image draft is unavailable.'},404);if(existing.request_hash!==requestHash)return json({error:'This image request belongs to another take.'},409);return json(publicIdentity(existing),existing.status==='generating'?202:200);}
  if(!b.retry){
   const previous=await db.prepare('SELECT * FROM take_identities WHERE owner=? AND request_hash=? ORDER BY created_at DESC LIMIT 1').bind(owner,requestHash).first<Row>();
   if(previous)return json(publicIdentity(previous),previous.status==='generating'&&Date.now()-previous.updated_at<=300000?202:200);
  }
  if(!env.OPENAI_API_KEY)return json({error:'Original artwork is temporarily unavailable. Your take can use its topic cover.',code:'ai_not_configured',title:nameTake(b.body,b.category)},503);
  if(!env.BUCKET)return json({error:'Image storage is unavailable. Try again shortly.'},503);
  const now=Date.now();
  const inserted=await db.prepare("INSERT OR IGNORE INTO take_identities(id,owner,thesis_id,body,category,title,status,request_hash,created_at,updated_at) SELECT ?,?,?,?,?,?,'generating',?,?,? WHERE NOT EXISTS(SELECT 1 FROM take_identities WHERE owner=? AND status='generating' AND updated_at>?) AND (SELECT COUNT(*) FROM take_identities WHERE owner=? AND created_at>?)<30").bind(b.id,owner,b.thesisId,b.body,b.category,nameTake(b.body,b.category),requestHash,now,now,owner,now-300000,owner,now-86400000).run();
  if(!inserted.meta.changes)return json({error:'Another image is generating, or your 30 daily image requests have been used. Finish the active image or try later.'},429);
  started=true;
  let concept=`A sculptural visual metaphor for ${b.category}, inspired by ${b.body.slice(0,400)}`;
  try{const identity=await describeTake(b.body,b.category,env.OPENAI_API_KEY);concept=identity.imageConcept;await db.prepare('UPDATE take_identities SET title=?,updated_at=? WHERE id=? AND owner=?').bind(identity.title,Date.now(),b.id,owner).run();}catch{/* A naming failure keeps the meaningful local name and still attempts the image. */}
  const prompt=imagePrompt(concept,b.body);await db.prepare('UPDATE take_identities SET prompt=?,updated_at=? WHERE id=? AND owner=?').bind(prompt,Date.now(),b.id,owner).run();
  const bytes=await generateTakeImage(prompt,env.OPENAI_API_KEY,env.OPENAI_IMAGE_MODEL);
  const key=`take-artwork/${owner}/${b.id}.webp`;await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:'image/webp'}});
  await db.prepare("UPDATE take_identities SET status='ready',image_key=?,error=NULL,updated_at=? WHERE id=? AND owner=?").bind(key,Date.now(),b.id,owner).run();
  const row=await db.prepare('SELECT * FROM take_identities WHERE id=? AND owner=?').bind(b.id,owner).first<Row>();return json(publicIdentity(row!));
 }catch(error){
  const message=error instanceof z.ZodError?'Give the take more detail before generating its image.':error instanceof Error&&error.name==='TimeoutError'?'Image generation timed out. Check the draft before explicitly retrying.':error instanceof Error&&error.message.startsWith('The image')||error instanceof Error&&error.message.startsWith('Image generation')?error.message:'The image could not finish. Your take can still be saved with its topic cover.';
  if(started&&identityId&&owner)try{await database().prepare("UPDATE take_identities SET status='failed',error=?,updated_at=? WHERE id=? AND owner=?").bind(message,Date.now(),identityId,owner).run();}catch{/* The existing request remains recoverable; never silently repeat a paid call. */}
  return json({error:message,id:identityId,status:'failed'},error instanceof z.ZodError?400:502);
 }
}
