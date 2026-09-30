import { GenerationError } from "./errors";
import { publicUrl } from "./urls";
import type { ResearchSource } from "./types";
export async function searchReport(options: {
  input: string;
  apiKey: string;
  model: string;
  schema: unknown;
  name: string;
  instructions: string;
  maxOutputTokens?: number;
  maxToolCalls?: number;
  fetcher?: typeof fetch;
  onResponse?: (raw: unknown) => Promise<void>;
}) {
  let response: Response;
  try {
    response = await (options.fetcher || fetch)(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(100000),
        body: JSON.stringify({
          model: options.model,
          store: false,
          reasoning: { effort: "low" },
          max_output_tokens: options.maxOutputTokens || 6500,
          max_tool_calls: options.maxToolCalls || 6,
          tools: [{ type: "web_search" }],
          tool_choice: "required",
          include: ["web_search_call.action.sources"],
          text: {
            format: {
              type: "json_schema",
              name: options.name,
              strict: true,
              schema: options.schema,
            },
          },
          instructions: options.instructions,
          input: options.input,
        }),
      },
    );
  } catch {
    throw new GenerationError(
      "provider_timeout",
      "AI research timed out. Please try again.",
      504,
    );
  }
  if (!response.ok) {
    if ([401, 403].includes(response.status))
      throw new GenerationError(
        "provider_auth",
        "Research is temporarily unavailable. Please try again later.",
        503,
      );
    if (response.status === 429)
      throw new GenerationError(
        "provider_limit",
        "The AI provider is rate-limited or out of API credit. Please try later.",
        429,
      );
    throw new GenerationError(
      "provider_error",
      "The AI provider could not complete this research. Please try again.",
      502,
    );
  }
  const raw = (await response.json()) as {
    id?: string;
    model?: string;
    status?: string;
    usage?: unknown;
    output?: Array<{
      type: string;
      status?: string;
      action?: { sources?: { url?: string; title?: string }[] };
      content?: {
        type: string;
        text?: string;
        annotations?: { type?: string; url?: string; title?: string }[];
      }[];
    }>;
  };
  await options.onResponse?.(raw);
  const output = raw.output || [];
  if (
    raw.status !== "completed" ||
    !output.some(
      (o) => o.type === "web_search_call" && o.status === "completed",
    )
  )
    throw new GenerationError(
      "incomplete_research",
      "The AI did not finish source-backed research. Please try again.",
    );
  if (output.some((o) => o.content?.some((c) => c.type === "refusal")))
    throw new GenerationError(
      "research_refused",
      "The AI could not research this take. Try a clearer investment theme.",
      422,
    );
  const sources: ResearchSource[] = [];
  for (const item of output) {
    for (const s of item.action?.sources || [])
      if (s.url && publicUrl(s.url))
        sources.push({ url: s.url, title: s.title || new URL(s.url).hostname });
    for (const c of item.content || [])
      for (const a of c.annotations || [])
        if (a.type === "url_citation" && a.url && publicUrl(a.url))
          sources.push({
            url: a.url,
            title: a.title || new URL(a.url).hostname,
          });
  }
  let report: unknown;
  try {
    report = JSON.parse(
      output
        .flatMap((o) => o.content || [])
        .filter((c) => c.type === "output_text")
        .map((c) => c.text || "")
        .join(""),
    );
  } catch {
    throw new GenerationError(
      "invalid_research",
      "The AI returned an incomplete report. Please try again.",
    );
  }
  return {
    report,
    sources: [...new Map(sources.map((s) => [s.url, s])).values()].slice(
      0,
      100,
    ),
    responseId: raw.id || "",
    model: raw.model || options.model,
    usage: raw.usage || null,
    raw,
  };
}
