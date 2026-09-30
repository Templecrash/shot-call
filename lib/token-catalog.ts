import { TOKENS, type Token, type Thesis } from "./data";
export function tokenFor(
  thesis: Pick<Thesis, "tokens"> | undefined,
  key: string,
): Token {
  return (
    thesis?.tokens?.[key] ||
    TOKENS[key] || {
      symbol: key.startsWith("cg:") ? key.slice(3) : key,
      name: key,
      color: "#64715c",
      icon: "",
      fit: "Fit not established",
      reason: "Research unavailable.",
      risk: "Token identity needs review.",
      source: "https://www.coingecko.com/",
    }
  );
}
export function mergedCatalog(
  theses: Pick<Thesis, "tokens">[],
): Record<string, Token> {
  const dynamic: Record<string, Token> = {};
  for (const t of theses)
    for (const [key, token] of Object.entries(t.tokens || {}))
      if (key.startsWith("cg:")) dynamic[key] = token;
  return { ...dynamic, ...TOKENS };
}
