import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { database } from '@/db/raw';
import { ProfileError, saveCreatorProfile } from '@/lib/profile-store';

export async function POST(req: Request) {
  const headers = {'Cache-Control':'private, no-store'};
  try {
    const user = await getChatGPTUser();
    if (!user) return Response.json({error:'Sign in to edit your profile.'},{status:401,headers});
    if (req.headers.get('origin') && new URL(req.headers.get('origin')!).origin !== new URL(req.url).origin)
      return Response.json({error:'Invalid origin.'},{status:403,headers});
    if (Number(req.headers.get('content-length') || 0) > 2500000)
      return Response.json({error:'Choose smaller profile images.'},{status:413,headers});
    const creator = await saveCreatorProfile(database(),env.BUCKET,user.userId,await req.formData());
    return Response.json({creator},{headers});
  } catch (error) {
    if (error instanceof ProfileError) return Response.json({error:error.message},{status:error.status,headers});
    console.error('Profile save failed',error);
    return Response.json({error:'Your profile could not be saved. Your changes are still here; please retry.'},{status:503,headers});
  }
}
