import { QdrantClient } from "@qdrant/js-client-rest";

import type { KnowledgeChunk } from "../types.js";
import { env } from "./env.js";
import { seedKnowledge } from "./seed-knowledge.js";
import { embedText } from "./vector.js";

const client = new QdrantClient({
  url: env.QDRANT_URL,
  apiKey: env.QDRANT_API_KEY || undefined,
});

let hasSeeded = false;

async function ensureCollection() {
  const existing = await client.getCollections();
  const hasCollection = existing.collections.some((collection) => collection.name === env.QDRANT_COLLECTION);
  if (!hasCollection) {
    await client.createCollection(env.QDRANT_COLLECTION, {
      vectors: {
        size: 48,
        distance: "Cosine",
      },
    });
  }
}

export async function ensureSeededVectors() {
  if (hasSeeded) {
    return;
  }
  await ensureCollection();
  await client.upsert(env.QDRANT_COLLECTION, {
    wait: true,
    points: seedKnowledge.map((item, index) => ({
      id: index + 1,
      vector: embedText(`${item.title} ${item.content} ${item.tags.join(" ")}`),
      payload: item,
    })),
  });
  hasSeeded = true;
}

export async function upsertKnowledgeChunk(chunk: Omit<KnowledgeChunk, "score">) {
  await ensureCollection();
  await client.upsert(env.QDRANT_COLLECTION, {
    wait: true,
    points: [
      {
        id: Number(chunk.id.replace(/\D/g, "").slice(0, 8)) || Date.now(),
        vector: embedText(`${chunk.title} ${chunk.content} ${chunk.tags.join(" ")}`),
        payload: chunk,
      },
    ],
  });
}

export async function searchKnowledge(query: string, limit = 5): Promise<KnowledgeChunk[]> {
  await ensureSeededVectors();
  const results = await client.search(env.QDRANT_COLLECTION, {
    vector: embedText(query),
    limit,
    with_payload: true,
  });
  return results.map((item) => {
    const payload = item.payload as Omit<KnowledgeChunk, "score">;
    return {
      ...payload,
      score: Number((item.score ?? 0).toFixed(3)),
    };
  });
}
