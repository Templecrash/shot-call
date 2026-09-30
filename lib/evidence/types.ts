export type EvidenceItem = {
  title: string;
  url: string;
  publisher: string;
  author: string | null;
  publishedAt: string | null;
  kind: "article" | "social" | "research" | "docs";
  stance: "supports" | "challenges" | "context";
  relationship: "project" | "independent" | "regulator" | "community";
  summary: string;
  relevance: string;
};
export type EvidenceReport = {
  id: string;
  thesisId: string;
  fingerprint: string;
  take: string;
  generatedAt: number;
  basis: "ai" | "curated";
  model?: string;
  items: EvidenceItem[];
  coverageNote: string;
};
export type EvidenceResponse = {
  ready: boolean;
  report: EvidenceReport | null;
  stale?: boolean;
  pendingId?: string;
  error?: string;
};
