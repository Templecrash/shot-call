import { MAX_THESIS_TOKENS } from "../limits";
import { z } from "zod";
import { publicUrl } from "./urls";
export { publicUrl } from "./urls";
import { evidenceSchema, EVIDENCE_JSON_SCHEMA } from "../evidence/core";

const url = z
  .string()
  .max(1000)
  .refine(publicUrl, "A public HTTPS source is required");
export const candidateSchema = z.object({
  name: z.string().min(1).max(80),
  symbol: z.string().min(1).max(20),
  coingecko_id: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,100}$/)
    .nullable(),
  exposure: z.enum(["Direct", "Platform", "Adjacent", "Infrastructure"]),
  instrument: z.enum(["crypto", "stock"]).optional(),
  reason: z.string().min(15).max(700),
  risk: z.string().min(10).max(500),
  source_url: url,
  official_url: url,
  weight: z.number().int().min(0).max(100),
  watchlist_reason: z.string().max(300).nullable(),
});
export const reportSchema = z
  .object({
    evidence: evidenceSchema.optional(),
    title: z.string().min(3).max(90),
    summary: z.string().min(8).max(180),
    category: z.enum([
      "Gacha & collectibles",
      "Gaming",
      "Privacy",
      "Majors",
      "Ethereum",
      "Launchpads",
      "Stock tokens",
      "AI & compute",
      "Real-world assets",
      "Macro",
      "Stables",
      "Custom",
    ]),
    risk: z.string().min(10).max(600),
    evidence_note: z.string().max(600),
    allocation_rationale: z.string().min(10).max(600),
    reserve_weight: z.number().int().min(0).max(100),
    candidates: z.array(candidateSchema).max(MAX_THESIS_TOKENS),
    products: z
      .array(
        z.object({
          name: z.string().min(1).max(80),
          url,
          type: z.string().min(1).max(40),
          description: z.string().min(10).max(240),
          token_note: z.string().min(1).max(140),
          source_url: url,
        }),
      )
      .max(6),
  })
  .superRefine((r, ctx) => {
    if (
      r.candidates.filter((c) => c.weight > 0).length +
        Number(r.reserve_weight > 0) >
      MAX_THESIS_TOKENS
    )
      ctx.addIssue({
        code: "custom",
        message: `A basket can contain at most ${MAX_THESIS_TOKENS} tokens, including an explicitly requested USDC holding.`,
      });
    if (
      r.reserve_weight + r.candidates.reduce((s, c) => s + c.weight, 0) !==
      100 && (r.reserve_weight > 0 || r.candidates.some(c => c.weight > 0))
    )
      ctx.addIssue({
        code: "custom",
        message: "Funded candidate and stablecoin weights must total 100%.",
      });
    if (r.candidates.some((c) => c.watchlist_reason && c.weight > 0))
      ctx.addIssue({
        code: "custom",
        message: "Watchlist candidates cannot have a weight.",
      });
  });
export type AIReport = z.infer<typeof reportSchema>;
export type AICandidate = z.infer<typeof candidateSchema>;
const string = (minLength: number, maxLength: number) => ({ type: "string", minLength, maxLength });
const sourceUrl = { ...string(1, 1000), pattern: "^https://" };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
// Match the runtime validator in the provider schema so valid structured output
// does not fail afterward on undisclosed length or format constraints.
// Zod still enforces URL safety and cross-field allocation rules.
export const REPORT_JSON_SCHEMA = obj({
  evidence: EVIDENCE_JSON_SCHEMA,
  title: string(3, 90),
  summary: string(8, 180),
  category: {
    type: "string",
    enum: [
      "Gacha & collectibles",
      "Gaming",
      "Privacy",
      "Majors",
      "Ethereum",
      "Launchpads",
      "Stock tokens",
      "AI & compute",
      "Real-world assets",
      "Macro",
      "Stables",
      "Custom",
    ],
  },
  risk: string(10, 600),
  evidence_note: string(0, 600),
  allocation_rationale: string(10, 600),
  reserve_weight: { type: "integer", minimum: 0, maximum: 100 },
  candidates: {
    type: "array",
    maxItems: MAX_THESIS_TOKENS,
    items: obj({
      name: string(1, 80),
      symbol: string(1, 20),
      coingecko_id: { type: ["string", "null"], pattern: "^[a-z0-9][a-z0-9-]{0,100}$" },
      exposure: {
        type: "string",
        enum: ["Direct", "Platform", "Adjacent", "Infrastructure"],
      },
      instrument: { type: "string", enum: ["crypto", "stock"] },
      reason: string(15, 700),
      risk: string(10, 500),
      source_url: sourceUrl,
      official_url: sourceUrl,
      weight: { type: "integer", minimum: 0, maximum: 100 },
      watchlist_reason: { type: ["string", "null"], maxLength: 300 },
    }),
  },
  products: {
    type: "array",
    maxItems: 6,
    items: obj({
      name: string(1, 80),
      url: sourceUrl,
      type: string(1, 40),
      description: string(10, 240),
      token_note: string(1, 140),
      source_url: sourceUrl,
    }),
  },
});
