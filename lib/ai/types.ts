import type { EvidenceReport } from "../evidence/types";
export type Exposure =
  "Direct" | "Platform" | "Adjacent" | "Infrastructure" | "Reserve";
export type ResearchSource = { title: string; url: string };
export type AIResearch = {
  evidence?: EvidenceReport;
  take: string;
  model: string;
  generatedAt: number;
  allocationRationale: string;
  notes: string;
  sources: ResearchSource[];
  watchlist: {
    name: string;
    symbol: string;
    reason: string;
    source?: string;
  }[];
  products: {
    name: string;
    url: string;
    type: string;
    description: string;
    tokenNote: string;
  }[];
};
