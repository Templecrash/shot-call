import {getChatGPTUser} from '@/app/chatgpt-auth';
import {database} from '@/db/raw';
import {memberInvitesState,createMemberInvite,InviteError} from '@/lib/invites';
const headers={'Cache-Control':'private, no-store'};
export async function GET(){
  try{const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to see your invites.'},{status:401,headers});return Response.json(await memberInvitesState(database(),user.userId),{headers});}catch(e){return failure(e);}
}
export async function POST(req:Request){
  try{
    const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in to share an invite.'},{status:401,headers});
    if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin.'},{status:403,headers});
    const body=await req.json() as {slot?:number};return Response.json(await createMemberInvite(database(),user.userId,body.slot??0),{headers});
  }catch(e){return failure(e);}
}
function failure(e:unknown){if(e instanceof InviteError)return Response.json({error:e.message},{status:e.status,headers});console.error('Invites unavailable',e);return Response.json({error:'Your invites could not be loaded. Please retry.'},{status:503,headers});}
