import { Document } from "@langchain/core/documents";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { QdrantClient } from "@qdrant/js-client-rest";
import { createHash, randomUUID } from "node:crypto";

import type { KnowledgeChunk } from "../types.js";
import { env } from "./env.js";
import { seedKnowledge } from "./seed-knowledge.js";

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: env.GOOGLE_API_KEY,
  model: env.GEMINI_EMBEDDING_MODEL,
});

const client = new QdrantClient({
  url: env.QDRANT_URL,
  apiKey: env.QDRANT_API_KEY || undefined,
  checkCompatibility: false,
});

let vectorStorePromise: Promise<QdrantVectorStore> | null = null;
let hasSeeded = false;
let vectorSizePromise: Promise<number> | null = null;

function ensureGeminiConfigured() {
  if (!env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is required for the LangChain + Gemini RAG pipeline.");
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function toPointId(id: string) {
  if (isUuid(id)) {
    return id;
  }
  const hash = createHash("md5").update(id).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function toVectorDocument(chunk: Omit<KnowledgeChunk, "score">) {
  return new Document({
    id: toPointId(chunk.id),
    pageContent: chunk.content,
    metadata: {
      id: chunk.id,
      title: chunk.title,
      language: chunk.language,
      tags: chunk.tags,
      source: chunk.source,
    },
  });
}

async function embedDocumentContent(text: string) {
  const vector = await embeddings.embedQuery(text);
  if (!vector.length) {
    throw new Error(
      `Gemini returned an empty embedding vector. Check GOOGLE_API_KEY and GEMINI_EMBEDDING_MODEL (${env.GEMINI_EMBEDDING_MODEL}).`,
    );
  }
  return vector;
}

async function getVectorSize() {
  if (!vectorSizePromise) {
    vectorSizePromise = embedDocumentContent("title: dimension probe | text: collection setup")
      .then((vector) => vector.length);
  }
  return vectorSizePromise;
}

async function ensureCollectionCompatibility() {
  const expectedSize = await getVectorSize();
  const collections = await client.getCollections();
  const exists = collections.collections.some((collection) => collection.name === env.QDRANT_COLLECTION);

  if (!exists) {
    await client.createCollection(env.QDRANT_COLLECTION, {
      vectors: {
        size: expectedSize,
        distance: "Cosine",
      },
    });
    hasSeeded = false;
    return;
  }

  const collection = await client.getCollection(env.QDRANT_COLLECTION);
  const config = collection.config?.params?.vectors;
  const currentSize =
    config && !Array.isArray(config) && "size" in config && typeof config.size === "number"
      ? config.size
      : null;

  if (currentSize === expectedSize) {
    return;
  }

  await client.recreateCollection(env.QDRANT_COLLECTION, {
    vectors: {
      size: expectedSize,
      distance: "Cosine",
    },
  });
  hasSeeded = false;
}

async function addChunkDocuments(vectorStore: QdrantVectorStore, chunks: Array<Omit<KnowledgeChunk, "score">>) {
  const documents = chunks.map(toVectorDocument);
  const vectors = await Promise.all(
    documents.map((document) => embedDocumentContent(document.pageContent)),
  );

  await vectorStore.addVectors(vectors, documents, {
    ids: chunks.map((chunk) => toPointId(chunk.id)),
  });
}

async function getVectorStore() {
  ensureGeminiConfigured();
  if (!vectorStorePromise) {
    await ensureCollectionCompatibility();
    vectorStorePromise = QdrantVectorStore.fromExistingCollection(embeddings, {
      client,
      collectionName: env.QDRANT_COLLECTION,
    });
  }
  return vectorStorePromise;
}

export async function ensureSeededVectors() {
  if (hasSeeded) {
    return;
  }
  const vectorStore = await getVectorStore();
  await addChunkDocuments(vectorStore, seedKnowledge);
  hasSeeded = true;
}

export async function upsertKnowledgeChunk(chunk: Omit<KnowledgeChunk, "score">) {
  await upsertKnowledgeChunks([chunk]);
}

export async function upsertKnowledgeChunks(chunks: Array<Omit<KnowledgeChunk, "score">>) {
  if (!chunks.length) {
    return;
  }
  const vectorStore = await getVectorStore();
  await addChunkDocuments(vectorStore, chunks);
}

export async function searchKnowledge(query: string, limit = 5): Promise<KnowledgeChunk[]> {
  await ensureSeededVectors();
  const vectorStore = await getVectorStore();
  const queryVector = await embeddings.embedQuery(query);
  const results = await vectorStore.similaritySearchVectorWithScore(queryVector, limit);

  return results.map(([document, score]) => {
    const metadata = document.metadata as Record<string, unknown>;
    return {
      id: String(metadata.id ?? document.id ?? randomUUID()),
      title: String(metadata.title ?? "Knowledge Source"),
      content: document.pageContent,
      language: String(metadata.language ?? "en-IN"),
      tags: Array.isArray(metadata.tags) ? metadata.tags.map((tag) => String(tag)) : [],
      source: String(metadata.source ?? "manual"),
      score: Number(score.toFixed(3)),
    };
  });
}
