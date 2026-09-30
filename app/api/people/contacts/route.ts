import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
import { parseContactHandles } from "@/lib/people";
import { matchContacts } from "@/lib/people-store";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).origin !== new URL(req.url).origin)
      return json({ error: "Invalid origin." }, 403);
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Sign in to find your contacts." }, 401);
    if (Number(req.headers.get("content-length") || 0) > 16000)
      return json({ error: "Paste up to 100 handles or profile links." }, 413);
    const { contacts } = z
      .object({ contacts: z.string().min(1).max(12000) })
      .strict()
      .parse(await req.json());
    const parsed = parseContactHandles(contacts);
    if (parsed.invalid.length || parsed.tooMany || !parsed.handles.length)
      return json(
        {
          error:
            "Use up to 100 X handles or profile links. Remove post links and other text.",
        },
        400,
      );
    return json({
      matches: await matchContacts(database(), user.userId, parsed.handles),
    });
  } catch (error) {
    return json(
      {
        error:
          error instanceof z.ZodError
            ? "Paste up to 100 X handles or profile links."
            : "Your contacts could not be matched. Please retry.",
      },
      error instanceof z.ZodError ? 400 : 503,
    );
  }
}
