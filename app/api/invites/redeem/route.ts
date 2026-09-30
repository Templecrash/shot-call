import {getChatGPTUser} from '@/app/chatgpt-auth';
import {database} from '@/db/raw';
import {redeemInvite,InviteError} from '@/lib/invites';
const headers={'Cache-Control':'private, no-store'};
export async function POST(req:Request){
  try{
    const user=await getChatGPTUser();if(!user)return Response.json({error:'Sign in before accepting your invite.'},{status:401,headers});
    if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'Invalid origin.'},{status:403,headers});
    const body=await req.json() as {code?:unknown};if(typeof body.code!=='string'||body.code.length>200)throw new InviteError('Enter a valid invite code.');
    return Response.json(await redeemInvite(database(),user.userId,body.code),{headers});
  }catch(e){if(e instanceof InviteError)return Response.json({error:e.message},{status:e.status,headers});console.error('Invite could not be accepted',e);return Response.json({error:'Your invite could not be accepted. Please retry.'},{status:503,headers});}
}
