import type { FastifyInstance } from "fastify";

import { env } from "../lib/env.js";

export async function registerHealthRoutes(server: FastifyInstance) {
  server.get("/health", async () => ({
    status: "ok",
    environment: env.APP_ENV,
    stack: "node-fastify-neon-drizzle-qdrant-sarvam",
  }));
}
