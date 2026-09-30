import { z } from "zod";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { database } from "@/db/raw";
import {
  listPeople,
  peopleState,
  setPeopleFollowing,
  PeopleError,
} from "@/lib/people-store";
const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
const input = z
  .object({
    creatorIds: z.array(z.string().min(1).max(120)).min(1).max(100),
    following: z.boolean(),
  })
  .strict();
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams,
      user = await getChatGPTUser(),
      db = database();
    if (params.get("mode") === "state")
      return json(await peopleState(db, user?.userId));
    const query = (params.get("q") || "").trim().replace(/^@/, ""),
      offset = Number(params.get("offset") || 0);
    if (
      query.length > 100 ||
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > 100000
    )
      return json({ error: "Choose a valid search." }, 400);
    return json(
      await listPeople(
        db,
        user?.userId,
        query,
        params.get("following") === "true",
        offset,
      ),
    );
  } catch {
    return json(
      { error: "People are temporarily unavailable. Please retry." },
      503,
    );
  }
}
export async function POST(req: Request) {
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).origin !== new URL(req.url).origin)
      return json({ error: "Invalid origin." }, 403);
    const user = await getChatGPTUser();
    if (!user) return json({ error: "Sign in to follow people." }, 401);
    if (Number(req.headers.get("content-length") || 0) > 16000)
      return json({ error: "Select up to 100 people at a time." }, 413);
    const body = input.parse(await req.json());
    return json(
      await setPeopleFollowing(
        database(),
        user.userId,
        body.creatorIds,
        body.following,
      ),
    );
  } catch (error) {
    return json(
      {
        error:
          error instanceof PeopleError
            ? error.message
            : error instanceof z.ZodError
              ? "Select valid profiles and a follow action."
              : "Your following list could not be updated. Please retry.",
      },
      error instanceof PeopleError
        ? error.status
        : error instanceof z.ZodError
          ? 400
          : 503,
    );
  }
}
