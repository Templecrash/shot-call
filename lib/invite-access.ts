import {isMember,inviteReturnTo} from './invites';

// Invite landing and frozen P&L cards are public. Trading, profiles, calls,
// research and their APIs all use the same membership boundary.
export function isPublicInvitePath(pathname:string){
  return pathname==='/api/invites/redeem'||/^\/api\/pnl\/[a-f0-9-]+\/image\/?$/.test(pathname)||/^\/api\/creators\/[^/]+\/avatar\/?$/.test(pathname);
}
export async function inviteAccess(req:Request,db:D1Database):Promise<Response|null>{
  const url=new URL(req.url);if(isPublicInvitePath(url.pathname))return null;
  const id=req.headers.get('oai-authenticated-user-id'),email=req.headers.get('oai-authenticated-user-email');
  try{
    if(id&&email&&await isMember(db,id))return null;
    if(url.pathname.startsWith('/api/'))return Response.json({error:'An invite is required to use Shot Call.',code:'invite_required',redirect:'/invite'},{status:id&&email?403:401,headers:{'Cache-Control':'private, no-store'}});
    const destination=new URL('/invite',url.origin);destination.searchParams.set('next',inviteReturnTo(url.pathname+url.search));
    return new Response(null,{status:307,headers:{Location:destination.href,'Cache-Control':'private, no-store'}});
  }catch(error){
    console.error('Invite access unavailable',error);
    return url.pathname.startsWith('/api/')?Response.json({error:'Access could not be checked. Please retry.'},{status:503,headers:{'Cache-Control':'private, no-store'}}):new Response('Shot Call access is temporarily unavailable. Please retry.',{status:503,headers:{'Cache-Control':'private, no-store'}});
  }
}
