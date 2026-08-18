import { index, integer, jsonb, pgTable, real, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const knowledgeDocuments = pgTable("knowledge_documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(),
  language: varchar("language", { length: 24 }).notNull().default("en-IN"),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  source: varchar("source", { length: 80 }).notNull().default("manual"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const conversationLogs = pgTable("conversation_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  transcript: text("transcript").notNull(),
  answer: text("answer").notNull(),
  language: varchar("language", { length: 24 }).notNull().default("en-IN"),
  confidence: real("confidence").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  createdAtIdx: index("conversation_logs_created_at_idx").on(table.createdAt),
}));

export const ingestionEvents = pgTable("ingestion_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  chunkCount: integer("chunk_count").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
