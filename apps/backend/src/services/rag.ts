import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { load } from "cheerio";
import { Document } from "@langchain/core/documents";
import { ChatGoogle } from "@langchain/google";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

import { env } from "../lib/env.js";
import { createKnowledgeDocument, listKnowledgeMetadata, recordConversation, recordIngestionEvent } from "../lib/repository.js";
import { searchKnowledge, upsertKnowledgeChunks } from "../lib/qdrant.js";
import { expandQuery, lexicalScore, normalizeQuery } from "../lib/text.js";
import { loadYoutubeSource } from "../lib/youtube.js";
import type { AssistantResponse, KnowledgeChunk } from "../types.js";
import { synthesizeSpeech } from "./sarvam.js";

type KnowledgeSourceType = "manual" | "website" | "youtube" | "pdf";

type IngestionResult = {
  status: "stored";
  documentId: string;
  totalChunks: number;
  notes?: string;
};

type UploadedPdf = {
  buffer: Buffer;
  filename: string;
  mimetype: string;
};

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 900,
  chunkOverlap: 180,
});

function ensureGeminiConfigured() {
  if (!env.GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY is required to use the Gemini-based RAG pipeline.");
  }
}

let chatModelInstance: ChatGoogle | null = null;

/** Lazily built so a missing API key surfaces as a request error, not a boot crash. */
function getChatModel() {
  ensureGeminiConfigured();
  if (!chatModelInstance) {
    chatModelInstance = new ChatGoogle({
      apiKey: env.GOOGLE_API_KEY,
      model: env.GEMINI_MODEL,
      temperature: 0.2,
    });
  }
  return chatModelInstance;
}

function rerank(query: string, chunks: KnowledgeChunk[]) {
  const queryTerms = new Set(subjectTerms(query));
  return chunks
    .map((chunk) => {
      const overlap = [...queryTerms].filter((term) => chunk.tags.includes(term)).length;
      const titleBonus = chunk.title.toLowerCase().split(" ").filter((term) => queryTerms.has(term)).length * 0.12;
      const lexicalBonus = lexicalScore(query, chunk);
      const directMatchBonus = hasDirectSubjectMatch(query, chunk) ? 1.4 : -0.45;
      return {
        ...chunk,
        score: Number(Math.max(0, chunk.score + overlap * 0.14 + titleBonus + lexicalBonus + directMatchBonus).toFixed(3)),
      };
    })
    .sort((left, right) => right.score - left.score);
}

function flattenModelText(content: unknown): string {
  if (typeof content === "string") {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object" && "text" in item && typeof item.text === "string") {
        return item.text;
      }
      return "";
    })
    .join("\n")
    .trim();
}

function cleanContent(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function dedupeTags(tags: string[]) {
  return [...new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))];
}

async function expandQueryWithGemini(query: string) {
  ensureGeminiConfigured();
  const fallback = expandQuery(query);
  if (!query) {
    return fallback;
  }

  const response = await getChatModel().invoke([
    {
      role: "system",
      content: "Generate short retrieval-friendly search rewrites for customer support RAG. Return plain text lines only.",
    },
    {
      role: "user",
      content: `Original query: ${query}\nReturn up to 3 alternative search queries, one per line, without numbering.`,
    },
  ]);

  const lines = flattenModelText(response.content)
    .split("\n")
    .map((line) => line.replace(/^[\d\-*.\s]+/, "").trim())
    .filter(Boolean);

  return [...new Set([query, ...fallback, ...lines])].slice(0, 5);
}

function shouldUseGeminiExpansion(query: string) {
  const terms = query.split(" ").filter(Boolean);
  return terms.length >= 5;
}

function sentencePreview(text: string, maxSentences = 2) {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.slice(0, maxSentences).join(" ");
}

function normalizeCustomerReply(value: string) {
  return value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*|__/g, "")
    .replace(/^\s*[-*+]\s*/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}
function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

const nonSubjectTerms = new Set([
  "about", "assistant", "customer", "details", "explain", "help", "information",
  "know", "please", "provide", "query", "tell", "what", "which", "with",
]);

function subjectTerms(query: string) {
  return [...new Set(tokenize(query).filter((term) => term.length > 2 && !nonSubjectTerms.has(term)))];
}
function levenshteinDistance(left: string, right: string) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }
  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      );
    }
  }

  return matrix[left.length][right.length];
}

function hasFuzzyTermMatch(queryTerm: string, haystack: string) {
  if (queryTerm.length < 4) {
    return haystack.includes(queryTerm);
  }

  const tokens = tokenize(haystack);
  return tokens.some((token) => {
    if (token === queryTerm) {
      return true;
    }
    const distance = levenshteinDistance(queryTerm, token);
    return distance <= 2 || token.includes(queryTerm) || queryTerm.includes(token);
  });
}

function hasDirectSubjectMatch(query: string, chunk: KnowledgeChunk) {
  const terms = subjectTerms(query);
  const haystack = [chunk.title, chunk.content, chunk.tags.join(" ")].join(" ").toLowerCase();
  return terms.some((term) => hasFuzzyTermMatch(term, haystack));
}
function extractKeywordSnippet(content: string, queryTerms: string[]) {
  const normalizedContent = content.replace(/\s+/g, " ").trim();
  const lowered = normalizedContent.toLowerCase();
  const matchIndex = queryTerms
    .map((term) => lowered.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  if (matchIndex === undefined) {
    return sentencePreview(normalizedContent, 2);
  }

  const start = Math.max(0, matchIndex - 120);
  const end = Math.min(normalizedContent.length, matchIndex + 320);
  return normalizedContent.slice(start, end).trim();
}

function buildExtractiveFallback(query: string, chunks: KnowledgeChunk[]) {
  const queryTerms = subjectTerms(query);
  const exactMatch = chunks.find((chunk) => hasDirectSubjectMatch(query, chunk));

  if (!exactMatch || !queryTerms.length) {
    return "";
  }

  return normalizeCustomerReply(sentencePreview(exactMatch.content, 2) || exactMatch.content);
}
function hasStrongDirectEvidence(query: string, chunks: KnowledgeChunk[]) {
  return subjectTerms(query).length > 0 && chunks.some((chunk) => hasDirectSubjectMatch(query, chunk));
}
async function searchKnowledgeByKeywords(query: string, limit = 4): Promise<KnowledgeChunk[]> {
  const normalizedQuery = normalizeQuery(query);
  const queryTerms = subjectTerms(normalizedQuery);

  if (!queryTerms.length) {
    return [];
  }

  const documents = await listKnowledgeMetadata();
  return documents
    .map((document) => {
      const title = String(document.title ?? "Knowledge Source");
      const content = String(document.content ?? "");
      const language = String(document.language ?? "en-IN");
      const source = String(document.source ?? "manual");
      const tags = Array.isArray(document.tags) ? document.tags.map((tag) => String(tag)) : [];
      const loweredHaystack = `${title} ${content} ${tags.join(" ")}`.toLowerCase();
      const exactTermMatches = queryTerms.filter((term) => hasFuzzyTermMatch(term, loweredHaystack)).length;

      if (!exactTermMatches) {
        return null;
      }

      const exactPhraseBonus = loweredHaystack.includes(normalizedQuery) ? 0.85 : 0;
      const titleMatchBonus = queryTerms.filter((term) => hasFuzzyTermMatch(term, title.toLowerCase())).length * 0.45;
      const exactMatchBonus = exactTermMatches * 1.2;
      const score = Number((exactMatchBonus + titleMatchBonus + exactPhraseBonus + lexicalScore(normalizedQuery, {
        id: String(document.id ?? crypto.randomUUID()),
        title,
        content,
        language,
        tags,
        source,
        score: 0,
      })).toFixed(3));

      return {
        id: String(document.id ?? crypto.randomUUID()),
        title,
        content: extractKeywordSnippet(content, queryTerms),
        language,
        tags,
        source,
        score,
      } satisfies KnowledgeChunk;
    })
    .filter((document): document is KnowledgeChunk => Boolean(document))
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

async function generateGroundedAnswer(query: string, preferredLanguage: string, chunks: KnowledgeChunk[], shouldEscalate: boolean) {
  if (shouldEscalate || !chunks.length) {
    return "I do not have enough reliable evidence to answer that safely right now. Please connect the customer to a human support agent.";
  }

  ensureGeminiConfigured();
  const context = chunks
    .map(
      (chunk, index) =>
        `Source ${index + 1}\nTitle: ${chunk.title}\nType: ${chunk.source}\nEvidence: ${chunk.content}`,
    )
    .join("\n\n");

  const response = await getChatModel().invoke([
    {
      role: "system",
      content:
        "You are a grounded customer support assistant. Answer only from the provided evidence. Write one concise, natural paragraph for a customer. Use plain text only: never use Markdown, asterisks, bullet points, labels, or headings. If the evidence clearly mentions the requested subject, answer directly from it and do not say the information is unavailable. If the evidence is weak or missing, say that a human agent should help.",
    },
    {
      role: "user",
      content: `Customer query: ${query}\nPreferred response language: ${preferredLanguage}\n\nEvidence:\n${context}\n\nReturn one final answer for the customer.`,
    },
  ]);

  const answer = flattenModelText(response.content);
  const lowerAnswer = answer.toLowerCase();
  if (
    lowerAnswer.includes("couldn't find") ||
    lowerAnswer.includes("cannot find") ||
    lowerAnswer.includes("no information") ||
    lowerAnswer.includes("not available in the records")
  ) {
    const fallback = buildExtractiveFallback(query, chunks);
    if (fallback) {
      return fallback;
    }
  }
  return answer || "I do not have enough reliable evidence to answer that safely right now. Please connect the customer to a human support agent.";
}

async function buildChunkRecords(input: {
  documentId: string;
  title: string;
  language: string;
  tags: string[];
  source: KnowledgeSourceType;
  sourceUrl?: string;
  documents: Document[];
}) {
  const normalizedDocuments = input.documents
    .map((document) => {
      const pageContent = cleanContent(document.pageContent);
      if (!pageContent) {
        return null;
      }
      return new Document({
        pageContent,
        metadata: document.metadata,
      });
    })
    .filter((document): document is Document => Boolean(document));

  const splitDocuments = await splitter.splitDocuments(normalizedDocuments);

  return splitDocuments.map((document, index) => {
    const metadata = document.metadata as Record<string, unknown>;
    return {
      id: crypto.randomUUID(),
      title: input.title,
      content: cleanContent(document.pageContent),
      language: input.language,
      tags: input.tags,
      source: input.source,
      metadata: {
        ...metadata,
        documentId: input.documentId,
        sourceUrl: input.sourceUrl,
        chunkIndex: index + 1,
      },
    };
  });
}

async function persistKnowledgeSource(input: {
  title: string;
  language: string;
  tags: string[];
  source: KnowledgeSourceType;
  sourceUrl?: string;
  content: string;
  documents: Document[];
}) : Promise<IngestionResult> {
  const record = await createKnowledgeDocument({
    title: input.title,
    content: input.content,
    language: input.language,
    tags: input.tags,
    source: input.source,
  });
  const documentId = "id" in record ? String(record.id) : crypto.randomUUID();
  const chunks = await buildChunkRecords({
    documentId,
    title: input.title,
    language: input.language,
    tags: input.tags,
    source: input.source,
    sourceUrl: input.sourceUrl,
    documents: input.documents,
  });

  await upsertKnowledgeChunks(
    chunks.map((chunk) => ({
      id: chunk.id,
      title: chunk.title,
      content: chunk.content,
      language: chunk.language,
      tags: chunk.tags,
      source: chunk.source,
    })),
  );
  await recordIngestionEvent(input.title, chunks.length);

  return {
    status: "stored",
    documentId,
    totalChunks: chunks.length,
  };
}

function toTitleCaseSource(source: KnowledgeSourceType) {
  return source.charAt(0).toUpperCase() + source.slice(1);
}

// Loopback, private, and link-local targets. Node reports IPv6 hostnames wrapped in
// brackets, so the IPv6 entries have to tolerate them.
const privateHostPatterns = [
  /^localhost$/i,
  /^\[?::1\]?$/,
  /^\[?(fc|fd)[0-9a-f]{2}:/i,
  /^\[?fe80:/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^0\.0\.0\.0$/,
];

function normalizeWebsiteUrl(value: string) {
  const candidate = /^https?:\/\//i.test(value) ? value : "https://" + value;
  const parsed = new URL(candidate);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Website URLs must use http or https.");
  }
  if (privateHostPatterns.some((pattern) => pattern.test(parsed.hostname))) {
    throw new Error("Local and private network URLs cannot be added to the knowledge base.");
  }

  return parsed;
}

async function loadWebsiteSource(url: string) {
  const parsedUrl = normalizeWebsiteUrl(url);
  let response: Response;
  try {
    response = await fetch(parsedUrl, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "BharatVoiceAI-RAG/1.0 (+website knowledge ingestion)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
  } catch (error) {
    const reason = error instanceof Error && error.name === "TimeoutError" ? "did not respond in time" : "could not be reached";
    throw new Error(`${parsedUrl.hostname} ${reason}. Check the address and that the page is publicly accessible.`);
  }

  if (!response.ok) {
    throw new Error("Website returned HTTP " + response.status + ". Check that the page is public and reachable.");
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) {
    throw new Error("The supplied URL did not return an HTML webpage.");
  }

  const html = await response.text();
  const $ = load(html);
  $("script, style, noscript, svg, nav, footer, header, aside, form, iframe").remove();

  const title = cleanContent($("meta[property='og:title']").attr("content") ?? $("title").first().text() ?? "");
  const main = $("main, article, [role='main'], .content, .post, .article").first();
  const pageText = cleanContent((main.length ? main : $("body")).text());

  if (pageText.length < 80) {
    throw new Error(
      "This website did not expose enough readable text. It may require sign-in or client-side JavaScript. Use a public article URL, a PDF, or paste the content manually.",
    );
  }

  return [
    new Document({
      pageContent: pageText,
      metadata: {
        title: title || parsedUrl.hostname,
        source: response.url,
      },
    }),
  ];
}

async function loadPdfSource(file: UploadedPdf) {
  const loader = new PDFLoader(new Blob([new Uint8Array(file.buffer)]), {
    splitPages: true,
  });
  return loader.load();
}

export async function respondToCustomer(input: { transcript: string; preferredLanguage: string; includeAudio: boolean }): Promise<AssistantResponse> {
  ensureGeminiConfigured();
  const normalizedQuery = normalizeQuery(input.transcript);
  const baseQuery = normalizedQuery || input.transcript;
  const expandedQueries = shouldUseGeminiExpansion(baseQuery)
    ? await expandQueryWithGemini(baseQuery)
    : expandQuery(baseQuery);
  const [semanticRetrievals, keywordRetrievals] = await Promise.all([
    Promise.all(expandedQueries.map((query) => searchKnowledge(query, 5))),
    searchKnowledgeByKeywords(baseQuery, 5),
  ]);
  const merged = new Map<string, KnowledgeChunk>();

  for (const chunk of semanticRetrievals.flat()) {
    const existing = merged.get(chunk.id);
    if (!existing || existing.score < chunk.score) {
      merged.set(chunk.id, chunk);
    }
  }

  for (const chunk of keywordRetrievals) {
    const existing = merged.get(chunk.id);
    if (!existing) {
      merged.set(chunk.id, chunk);
      continue;
    }
    merged.set(chunk.id, {
      ...existing,
      content: existing.content.length >= chunk.content.length ? existing.content : chunk.content,
      score: Number((existing.score + chunk.score).toFixed(3)),
    });
  }

  const reranked = rerank(baseQuery, [...merged.values()]).slice(0, 4);
  const retrievalScore = reranked[0]?.score ?? 0;
  const confidence = Number((1 - Math.exp(-Math.max(0, retrievalScore) / 1.6)).toFixed(3));
  const strongDirectEvidence = hasStrongDirectEvidence(baseQuery, reranked);
  const shouldEscalate = retrievalScore < env.CONFIDENCE_THRESHOLD && !strongDirectEvidence;
  const answer = await generateGroundedAnswer(baseQuery, input.preferredLanguage, reranked, shouldEscalate);
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
    citations: [...new Set(reranked.map((chunk) => chunk.title))],
    retrievedChunks: reranked,
    pipelineMode: "hybrid-langchain-gemini-neon-qdrant-sarvam",
    audioBase64,
  };
}

export async function ingestKnowledge(input: { title: string; content: string; language: string; tags: string[] }) {
  const title = input.title.trim();
  const content = cleanContent(input.content);
  const tags = dedupeTags(input.tags);

  return persistKnowledgeSource({
    title,
    content,
    language: input.language,
    tags,
    source: "manual",
    documents: [
      new Document({
        pageContent: content,
        metadata: {
          title,
        },
      }),
    ],
  });
}

export async function ingestKnowledgeSource(input: {
  sourceType: Exclude<KnowledgeSourceType, "manual">;
  title?: string;
  url?: string;
  language: string;
  tags: string[];
  file?: UploadedPdf | null;
}) {
  ensureGeminiConfigured();
  const tags = dedupeTags(input.tags);

  if (input.sourceType === "website") {
    const url = input.url?.trim();
    if (!url) {
      throw new Error("A website URL is required for website ingestion.");
    }
    const documents = await loadWebsiteSource(url);
    const suggestedTitle = String((documents[0]?.metadata as Record<string, unknown> | undefined)?.title ?? url);
    return persistKnowledgeSource({
      title: input.title?.trim() || suggestedTitle || `${toTitleCaseSource(input.sourceType)} Source`,
      content: documents.map((document) => cleanContent(document.pageContent)).join("\n\n"),
      language: input.language,
      tags,
      source: "website",
      sourceUrl: url,
      documents,
    });
  }

  if (input.sourceType === "youtube") {
    const url = input.url?.trim();
    if (!url) {
      throw new Error("A YouTube URL is required for YouTube ingestion.");
    }
    const { documents, notes } = await loadYoutubeSource(url, input.language);
    const suggestedTitle = String((documents[0]?.metadata as Record<string, unknown> | undefined)?.title ?? url);
    const sourceUrl = String((documents[0]?.metadata as Record<string, unknown> | undefined)?.source ?? url);
    const result = await persistKnowledgeSource({
      title: input.title?.trim() || suggestedTitle || `${toTitleCaseSource(input.sourceType)} Source`,
      content: documents.map((document) => cleanContent(document.pageContent)).join("\n\n"),
      language: input.language,
      tags,
      source: "youtube",
      sourceUrl,
      documents,
    });
    return notes ? { ...result, notes } : result;
  }

  if (!input.file) {
    throw new Error("A PDF file is required for PDF ingestion.");
  }

  const documents = await loadPdfSource(input.file);
  const fallbackTitle = input.file.filename || "PDF Upload";
  return persistKnowledgeSource({
    title: input.title?.trim() || fallbackTitle,
    content: documents.map((document) => cleanContent(document.pageContent)).join("\n\n"),
    language: input.language,
    tags,
    source: "pdf",
    sourceUrl: input.file.filename,
    documents,
  });
}





