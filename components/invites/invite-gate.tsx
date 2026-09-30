import {redirect} from 'next/navigation';
import {getChatGPTUser,chatGPTSignInPath} from '@/app/chatgpt-auth';
import {database} from '@/db/raw';
import {isMember,previewInvite,inviteReturnTo,inviteCode} from '@/lib/invites';
import {InviteEntry} from './invite-entry';

export async function InviteGate({code='',next='/'}:{code?:string;next?:string}){
  const user=await getChatGPTUser(),destination=inviteReturnTo(next);let member=false,inviter:string|null=null,problem='';
  try{
    if(user)member=await isMember(database(),user.userId);
    if(!member&&code){const preview=await previewInvite(database(),code);if(!preview?.available)problem='This invite is invalid or has already been claimed. Ask a member for another link.';else inviter=preview.handle?'@'+preview.handle:preview.inviter;}
  }catch(e){console.error('Invite landing unavailable',e);problem='Invites are temporarily unavailable. Please try again shortly.';}
  if(member)redirect(destination);
  const returnPath=inviteCode(code)?`/invite/${code}?next=${encodeURIComponent(destination)}`:'/invite';
  return <InviteEntry code={code} signedIn={!!user} signInHref={chatGPTSignInPath(returnPath)} next={destination} inviter={inviter} problem={problem}/>;
}
