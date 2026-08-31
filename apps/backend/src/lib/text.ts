import type { KnowledgeChunk } from "../types.js";

const fillerTerms = new Set([
  "please",
  "actually",
  "basically",
  "hello",
  "hi",
  "hey",
  "uh",
  "um",
  "ji",
  "tell",
  "me",
  "about",
  "can",
  "could",
  "would",
  "you",
  "first",
]);

const synonyms: Record<string, string[]> = {
  refund: ["refund status", "money back", "return refund"],
  bill: ["billing", "invoice", "payment issue"],
  order: ["shipment", "tracking", "delivery status"],
  recharge: ["plan", "top up", "payment recharge"],
};

export function normalizeQuery(query: string) {
  const cleaned = query.toLowerCase().replace(/[^a-z0-9\s-]/g, " ");
  return cleaned
    .split(/\s+/)
    .filter((token) => token && !fillerTerms.has(token))
    .join(" ")
    .trim();
}

export function expandQuery(query: string) {
  const expansions = new Set([query]);
  for (const token of query.split(" ")) {
    for (const synonym of synonyms[token] ?? []) {
      expansions.add(`${query} ${synonym}`.trim());
    }
  }
  return [...expansions];
}

export function lexicalScore(query: string, candidate: KnowledgeChunk) {
  const content = `${candidate.title} ${candidate.content} ${candidate.tags.join(" ")}`.toLowerCase();
  return query.split(" ").reduce((score, token) => {
    const tokenBonus = candidate.tags.includes(token) ? 0.2 : 0;
    return score + (content.includes(token) ? 0.18 + tokenBonus : 0);
  }, 0);
}
