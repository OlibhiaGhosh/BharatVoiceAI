import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Multipart, MultipartFile } from "@fastify/multipart";
import { z } from "zod";

import { ingestKnowledge, ingestKnowledgeSource, respondToCustomer } from "../services/rag.js";
import { transcribeAudio } from "../services/sarvam.js";

const ingestSchema = z.object({
  title: z.string().min(3),
  content: z.string().min(10),
  language: z.string().default("en-IN"),
  tags: z.array(z.string()).default([]),
});

function readMultipartValue(field: Multipart | Multipart[] | undefined) {
  if (!field || Array.isArray(field) || "file" in field) {
    return "";
  }
  return typeof field.value === "string" ? field.value : "";
}

async function readKnowledgeSourceForm(request: FastifyRequest) {
  const fields = new Map<string, string>();
  let file:
    | {
        buffer: Buffer;
        filename: string;
        mimetype: string;
      }
    | null = null;

  for await (const part of request.parts()) {
    if (part.type === "file") {
      file = {
        buffer: await part.toBuffer(),
        filename: part.filename,
        mimetype: part.mimetype,
      };
      continue;
    }
    fields.set(part.fieldname, String(part.value ?? ""));
  }

  return {
    file,
    sourceType: fields.get("sourceType") ?? "",
    title: fields.get("title") ?? "",
    url: fields.get("url") ?? "",
    language: fields.get("language") ?? "en-IN",
    tags: (fields.get("tags") ?? "")
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
}

export async function registerAssistantRoutes(server: FastifyInstance) {
  server.post("/respond", async (request, reply) => {
    const file = await request.file();
    const fields = file?.fields ?? {};
    const transcriptHint = readMultipartValue(fields.transcriptHint);
    const preferredLanguage = readMultipartValue(fields.preferredLanguage) || "en-IN";
    const includeAudio = readMultipartValue(fields.includeAudio) === "true";
    const transcript = await transcribeAudio((file as MultipartFile | undefined) ?? null, preferredLanguage, transcriptHint);
    if (!transcript.trim()) {
      return reply.code(422).send({
        message: "No speech was detected. Check microphone permission, speak for at least two seconds, then try again.",
      });
    }
    const response = await respondToCustomer({
      transcript,
      preferredLanguage,
      includeAudio,
    });
    return reply.send(response);
  });

  server.post("/knowledge", async (request, reply) => {
    const payload = ingestSchema.parse(request.body);
    const response = await ingestKnowledge(payload);
    return reply.code(201).send(response);
  });

  server.post("/knowledge/source", async (request, reply) => {
    const payload = await readKnowledgeSourceForm(request);
    const sourceType = z.enum(["website", "youtube", "pdf"]).parse(payload.sourceType);
    const response = await ingestKnowledgeSource({
      sourceType,
      title: payload.title,
      url: payload.url,
      language: payload.language,
      tags: payload.tags,
      file: payload.file,
    });
    return reply.code(201).send(response);
  });
}


