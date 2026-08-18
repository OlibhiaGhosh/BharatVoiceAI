import { env } from "../lib/env.js";
import { createKnowledgeDocument, recordConversation, recordIngestionEvent } from "../lib/repository.js";
import { searchKnowledge, upsertKnowledgeChunk } from "../lib/qdrant.js";
import { expandQuery, lexicalScore, normalizeQuery } from "../lib/text.js";
import type { AssistantResponse, KnowledgeChunk } from "../types.js";
import { generateAnswer, synthesizeSpeech } from "./sarvam.js";

function rerank(query: string, chunks: KnowledgeChunk[]) {
  const queryTerms = new Set(query.split(" "));
  return chunks
    .map((chunk) => {
      const overlap = [...queryTerms].filter((term) => chunk.tags.includes(term)).length;
      const titleBonus = chunk.title.toLowerCase().split(" ").filter((term) => queryTerms.has(term)).length * 0.12;
      const lexicalBonus = lexicalScore(query, chunk);
      return {
        ...chunk,
        score: Number((chunk.score + overlap * 0.14 + titleBonus + lexicalBonus).toFixed(3)),
      };
    })
    .sort((left, right) => right.score - left.score);
}

export async function respondToCustomer(input: { transcript: string; preferredLanguage: string; includeAudio: boolean }): Promise<AssistantResponse> {
  const normalizedQuery = normalizeQuery(input.transcript);
  const expandedQueries = expandQuery(normalizedQuery);
  const retrievals = await Promise.all(expandedQueries.map((query) => searchKnowledge(query, 4)));
  const merged = new Map<string, KnowledgeChunk>();

  for (const chunk of retrievals.flat()) {
    const existing = merged.get(chunk.id);
    if (!existing || existing.score < chunk.score) {
      merged.set(chunk.id, chunk);
    }
  }

  const reranked = rerank(normalizedQuery, [...merged.values()]).slice(0, 4);
  const confidence = reranked[0]?.score ?? 0;
  const shouldEscalate = confidence < env.CONFIDENCE_THRESHOLD;
  const context = reranked.map((chunk) => `[${chunk.title}] ${chunk.content}`).join("\n\n");
  const answer = await generateAnswer(normalizedQuery || input.transcript, context, shouldEscalate);
  const audioBase64 = input.includeAudio ? await synthesizeSpeech(answer, input.preferredLanguage) : "";

  await recordConversation({
    transcript: input.transcript,
    answer,
    language: input.preferredLanguage,
    confidence,
  });

  return {
    transcript: input.transcript,
    normalizedQuery,
    expandedQueries,
    answer,
    confidence,
    shouldEscalate,
    citations: reranked.map((chunk) => chunk.title),
    retrievedChunks: reranked,
    pipelineMode: "neon-qdrant-sarvam",
    audioBase64,
  };
}

export async function ingestKnowledge(input: { title: string; content: string; language: string; tags: string[] }) {
  const document = await createKnowledgeDocument({
    title: input.title,
    content: input.content,
    language: input.language,
    tags: input.tags,
    source: "manual",
  });
  const chunk = {
    id: "id" in document ? String(document.id) : crypto.randomUUID(),
    title: input.title,
    content: input.content,
    language: input.language,
    tags: input.tags,
    source: "manual",
  };
  await upsertKnowledgeChunk(chunk);
  await recordIngestionEvent(input.title, 1);
  return {
    status: "stored",
    documentId: chunk.id,
    totalChunks: 1,
  };
}
