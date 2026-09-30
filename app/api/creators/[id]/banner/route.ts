import { env } from 'cloudflare:workers';
import { database } from '@/db/raw';
export async function GET(_req: Request, {params}:{params:Promise<{id:string}>}) {
  try {
    const {id}=await params;
    const row=await database().prepare('SELECT banner_key FROM creator_profiles WHERE id=?').bind(id).first<{banner_key:string|null}>();
    if(!row?.banner_key || !env.BUCKET) return new Response(null,{status:404});
    const object=await env.BUCKET.get(row.banner_key);
    if(!object) return new Response(null,{status:404});
    return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/jpeg','Cache-Control':'public, max-age=300','X-Content-Type-Options':'nosniff'}});
  } catch { return new Response(null,{status:503}); }
}
