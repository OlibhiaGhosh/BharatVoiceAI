import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Multipart, MultipartFile } from "@fastify/multipart";
import { z } from "zod";

import { ingestKnowledge, ingestKnowledgeSource, respondToCustomer } from "../services/rag.js";
import { transcribeAudio } from "../services/sarvam.js";

function toClientMessage(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
  }
  return error instanceof Error ? error.message : fallback;
}

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
    try {
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
    } catch (error) {
      request.log.error({ error }, "assistant response failed");
      return reply.code(502).send({
        message: toClientMessage(error, "The assistant could not answer that request."),
      });
    }
  });

  server.post("/knowledge", async (request, reply) => {
    try {
      const payload = ingestSchema.parse(request.body);
      const response = await ingestKnowledge(payload);
      return reply.code(201).send(response);
    } catch (error) {
      request.log.error({ error }, "manual knowledge ingestion failed");
      return reply.code(422).send({
        message: toClientMessage(error, "Knowledge could not be added."),
      });
    }
  });

  server.post("/knowledge/source", async (request, reply) => {
    try {
      const payload = await readKnowledgeSourceForm(request);
      const sourceType = z.enum(["website", "youtube", "pdf"]).parse(payload.sourceType);

      if (sourceType === "pdf" && payload.file) {
        const isPdf =
          payload.file.mimetype === "application/pdf" ||
          payload.file.filename.toLowerCase().endsWith(".pdf");
        if (!isPdf) {
          return reply.code(422).send({
            message: `"${payload.file.filename}" is not a PDF. Upload a .pdf file, or paste the text as a manual entry.`,
          });
        }
      }

      const response = await ingestKnowledgeSource({
        sourceType,
        title: payload.title,
        url: payload.url,
        language: payload.language,
        tags: payload.tags,
        file: payload.file,
      });
      return reply.code(201).send(response);
    } catch (error) {
      request.log.error({ error }, "knowledge source ingestion failed");
      return reply.code(422).send({
        message: toClientMessage(error, "Knowledge source could not be added."),
      });
    }
  });
}



