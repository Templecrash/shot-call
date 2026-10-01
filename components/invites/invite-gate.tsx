import {redirect} from 'next/navigation';
import {inviteReturnTo} from '@/lib/invites';

// Previously shared invite URLs remain useful, including claimed or old codes.
export async function InviteGate({next='/'}:{code?:string;next?:string}){
  return redirect(inviteReturnTo(next));
}
