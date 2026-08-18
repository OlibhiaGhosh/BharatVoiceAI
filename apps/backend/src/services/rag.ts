import { seedKnowledge } from "../lib/seed-knowledge.js";
import type { AssistantResponse, KnowledgeChunk } from "../types.js";

function retrieveBasic(query: string) {
  const normalized = query.toLowerCase();
  return seedKnowledge
    .map((chunk) => ({
      ...chunk,
      score: Number(((chunk.title + " " + chunk.content).toLowerCase().includes(normalized) ? 0.92 : chunk.tags.some((tag) => normalized.includes(tag)) ? 0.71 : 0).toFixed(3)),
    }))
    .filter((chunk) => chunk.score > 0)
    .slice(0, 3);
}

export async function respondToCustomer(input: { transcript: string; preferredLanguage: string; includeAudio: boolean }): Promise<AssistantResponse> {
  const retrievedChunks = retrieveBasic(input.transcript);
  const answer = retrievedChunks.length
    ? `Based on ${retrievedChunks[0].title}: ${retrievedChunks[0].content}`
    : "I could not find a matching answer in the knowledge base yet.";

  return {
    transcript: input.transcript,
    normalizedQuery: input.transcript,
    expandedQueries: input.transcript ? [input.transcript] : [],
    answer,
    confidence: retrievedChunks[0]?.score ?? 0,
    shouldEscalate: false,
    citations: retrievedChunks.map((chunk) => chunk.title),
    retrievedChunks,
    pipelineMode: "basic-rag",
    audioBase64: "",
  };
}

export async function ingestKnowledge(input: { title: string; content: string; language: string; tags: string[] }) {
  return {
    status: "stored",
    documentId: crypto.randomUUID(),
    totalChunks: 1,
  };
}
