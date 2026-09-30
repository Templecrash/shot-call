import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
import { fundDemoWallet } from "@/lib/demo-wallet";
import { z } from "zod";

export async function POST(req: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const user = await getChatGPTUser();
  if (!user) return Response.json({error:"Sign in to use your demo wallet."},{status:401,headers});
  if (req.headers.get("origin") && new URL(req.headers.get("origin")!).host !== new URL(req.url).host) return Response.json({error:"Invalid origin"},{status:403,headers});
  try {
    const body = z.object({ action:z.enum(["connect","disconnect","fund"]), id:z.string().uuid(), amount:z.number().int().optional(), network:z.string().trim().optional() }).parse(await req.json());
    const db = database();
    await db.prepare("INSERT OR IGNORE INTO accounts (user_id) VALUES (?)").bind(user.userId).run();
    if (body.action === "fund") return Response.json(await fundDemoWallet(db,user.userId,body.id,body.amount??0,body.network??""),{headers});
    await db.prepare("UPDATE accounts SET demo_wallet_connected=?,revision=revision+1 WHERE user_id=?").bind(body.action === "connect" ? 1 : 0,user.userId).run();
    return Response.json({ok:true},{headers});
  } catch (e) {
    return Response.json({error:e instanceof z.ZodError ? "Check the deposit amount and network." : e instanceof Error ? e.message : "Could not update your demo wallet. Try again."},{status:400,headers});
  }
}
