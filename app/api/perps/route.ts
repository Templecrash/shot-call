import {readThesis} from "@/lib/thesis-store";
import {getChatGPTUser} from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
import { loadCreatorCoverage } from "@/lib/perps";
export async function GET(req: Request) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const id = new URL(req.url).searchParams.get("thesisId");
    if (!id || id.length > 80)
      return Response.json(
        { error: "Choose a saved take." },
        { status: 400, headers },
      );
    const user=await getChatGPTUser();
    const thesis=await readThesis(database(),id,user?.userId);
    if (!thesis)
      return Response.json(
        { error: "This take could not be found." },
        { status: 404, headers },
      );
    return Response.json(await loadCreatorCoverage(thesis), { headers });
  } catch (error) {
    console.error("Perp availability", error);
    return Response.json(
      { error: "Perp availability could not be verified. Retry shortly." },
      { status: 503, headers },
    );
  }
}
