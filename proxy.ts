import {NextResponse,type NextRequest} from 'next/server';
export function proxy(request:NextRequest){
  // The demo is open without an invite. Each API still authenticates writes
  // and scopes private data to the signed-in user.
  const path=request.nextUrl.pathname;
  if(/^\/api\/pnl\/[a-f0-9-]+\/image\/?$/.test(path)||/^\/api\/creators\/[^/]+\/avatar\/?$/.test(path))return NextResponse.next();
  const response=NextResponse.next();response.headers.set('Cache-Control','private, no-store');return response;
}
export const config={matcher:['/','/take/:path*','/creator/:path*','/api/:path*']};
