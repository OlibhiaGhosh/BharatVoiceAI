import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";

import { registerAssistantRoutes } from "./routes/assistant.js";
import { registerHealthRoutes } from "./routes/health.js";

export function buildServer() {
  const server = Fastify({ logger: true });

  server.register(cors, {
    origin: true,
    credentials: true,
  });
  server.register(multipart, {
    limits: {
      fileSize: 25 * 1024 * 1024,
    },
  });

  server.register(registerHealthRoutes, { prefix: "/api" });
  server.register(registerAssistantRoutes, { prefix: "/api/assistant" });

  return server;
}
