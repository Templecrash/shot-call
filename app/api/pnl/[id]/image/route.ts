import {env} from 'cloudflare:workers';
import {database} from '@/db/raw';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const {id}=await params;
    const row=await database().prepare('SELECT image_key FROM pnl_cards WHERE id=?').bind(id).first<{image_key:string}>();
    if(!row||!env.BUCKET)return new Response(null,{status:404});
    const image=await env.BUCKET.get(row.image_key);if(!image)return new Response(null,{status:404});
    return new Response(image.body,{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
  }catch{return new Response(null,{status:503});}
}
