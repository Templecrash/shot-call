import {env} from 'cloudflare:workers';
import {database} from '@/db/raw';
import {getChatGPTUser} from '@/app/chatgpt-auth';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
 try{const {id}=await params,user=await getChatGPTUser();
 const row=await database().prepare("SELECT a.image_key FROM take_identities a WHERE a.id=? AND a.status='ready' AND (a.owner=? OR EXISTS(SELECT 1 FROM theses t WHERE t.artwork_id=a.id AND t.owner=a.owner AND t.visibility='public'))").bind(id,user?.userId||'').first<{image_key:string|null}>();
 if(!row?.image_key||!env.BUCKET)return new Response(null,{status:404});const object=await env.BUCKET.get(row.image_key);if(!object)return new Response(null,{status:404});
 return new Response(object.body,{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return new Response(null,{status:503});}
}
