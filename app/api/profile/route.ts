import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
import { loadPaperProfile } from '@/lib/profile-performance-store';
import {saveBuyPreset, ProfileSettingsError} from '@/lib/profile-settings';

export async function PATCH(request: Request) {
  const headers = {'Cache-Control':'private, no-store'};
  try {
    const user=await getChatGPTUser();
    if(!user)return Response.json({error:'Sign in to save your settings.'},{status:401,headers});
    let body: unknown;
    try { body=await request.json(); } catch { return Response.json({error:'Send valid profile settings.'},{status:400,headers}); }
    const amount=body&&typeof body==='object'?(body as Record<string,unknown>).defaultBuyAmount:undefined;
    const defaultBuyAmount=await saveBuyPreset(database(),user.userId,amount);
    return Response.json({defaultBuyAmount},{headers});
  } catch(error) {
    if(error instanceof ProfileSettingsError)return Response.json({error:error.message},{status:400,headers});
    console.error('Profile settings could not save',error);
    return Response.json({error:'Your settings could not be saved. Please retry.'},{status:503,headers});
  }
}

export async function GET() {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    const user = await getChatGPTUser();
    if (!user)
      return Response.json(
        { error: "Sign in to see your performance." },
        { status: 401, headers },
      );
    const db = database();
    await db
      .prepare("INSERT OR IGNORE INTO accounts (user_id) VALUES (?)")
      .bind(user.userId)
      .run();
    return Response.json(await loadPaperProfile(db,user.userId),{headers});
  } catch (error) {
    console.error("Profile could not load", error);
    return Response.json(
      { error: "Your performance is unavailable. Please retry." },
      { status: 503, headers },
    );
  }
}
