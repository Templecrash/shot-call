import type {Metadata} from 'next';
import {InviteGate} from '@/components/invites/invite-gate';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Open the demo · Shot Call',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{next?:string}>}){
  const query=await searchParams;return <InviteGate next={query.next}/>;
}
