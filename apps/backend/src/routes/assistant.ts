import type { FastifyInstance } from "fastify";
import type { Multipart, MultipartFile } from "@fastify/multipart";
import { z } from "zod";

import { ingestKnowledge, respondToCustomer } from "../services/rag.js";
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

export async function registerAssistantRoutes(server: FastifyInstance) {
  server.post("/respond", async (request, reply) => {
    const file = await request.file();
    const fields = file?.fields ?? {};
    const transcriptHint = readMultipartValue(fields.transcriptHint);
    const preferredLanguage = readMultipartValue(fields.preferredLanguage) || "en-IN";
    const includeAudio = readMultipartValue(fields.includeAudio) === "true";
    const transcript = await transcribeAudio((file as MultipartFile | undefined) ?? null, transcriptHint);
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
}
