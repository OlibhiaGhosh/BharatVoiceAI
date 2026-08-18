import { desc } from "drizzle-orm";

import { db } from "../db/client.js";
import { conversationLogs, ingestionEvents, knowledgeDocuments } from "../db/schema.js";
import { seedKnowledge } from "./seed-knowledge.js";
import type { ConversationRecord, KnowledgeChunk } from "../types.js";

export async function listKnowledgeMetadata() {
  if (!db) {
    return seedKnowledge;
  }
  return db.select().from(knowledgeDocuments).orderBy(desc(knowledgeDocuments.createdAt));
}

export async function createKnowledgeDocument(input: Omit<KnowledgeChunk, "score" | "id" | "source"> & { source?: string }) {
  if (!db) {
    return {
      id: crypto.randomUUID(),
      source: input.source ?? "manual",
      ...input,
    };
  }
  const [row] = await db.insert(knowledgeDocuments).values({
    title: input.title,
    content: input.content,
    language: input.language,
    tags: input.tags,
    source: input.source ?? "manual",
  }).returning();
  return row;
}

export async function recordIngestionEvent(title: string, chunkCount: number) {
  if (!db) {
    return;
  }
  await db.insert(ingestionEvents).values({ title, chunkCount });
}

export async function recordConversation(entry: ConversationRecord) {
  if (!db) {
    return;
  }
  await db.insert(conversationLogs).values(entry);
}
