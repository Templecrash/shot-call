import {NextResponse,type NextRequest} from 'next/server';
import {database} from '@/db/raw';
import {inviteAccess,isPublicInvitePath} from '@/lib/invite-access';
export async function proxy(request:NextRequest){
  if(isPublicInvitePath(request.nextUrl.pathname))return NextResponse.next();
  const blocked=await inviteAccess(request,database());if(blocked)return blocked;
  const response=NextResponse.next();response.headers.set('Cache-Control','private, no-store');return response;
}
export const config={matcher:['/','/take/:path*','/creator/:path*','/api/:path*']};
