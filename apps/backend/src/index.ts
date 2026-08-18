import { buildServer } from "./server.js";
import { env } from "./lib/env.js";

const server = buildServer();

try {
  await server.listen({ host: "0.0.0.0", port: env.PORT });
  server.log.info(`BharatVoiceAI backend listening on port ${env.PORT}`);
} catch (error) {
  server.log.error(error);
  process.exit(1);
}
