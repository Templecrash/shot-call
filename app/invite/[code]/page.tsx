import type {Metadata} from 'next';
import {InviteGate} from '@/components/invites/invite-gate';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'You’re invited · Shot Call',description:'Join Shot Call by invitation and bring five people with you.',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params,searchParams}:{params:Promise<{code:string}>;searchParams:Promise<{next?:string}>}){
  const [path,query]=await Promise.all([params,searchParams]);return <InviteGate code={path.code} next={query.next}/>;
}
