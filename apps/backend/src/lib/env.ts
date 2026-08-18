import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  APP_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().default(""),
  QDRANT_URL: z.string().default("http://localhost:6333"),
  QDRANT_API_KEY: z.string().default(""),
  QDRANT_COLLECTION: z.string().default("bharatvoiceai_chunks"),
  SARVAM_API_KEY: z.string().default(""),
  SARVAM_BASE_URL: z.string().default("https://api.sarvam.ai"),
  SARVAM_CHAT_MODEL: z.string().default("sarvam-m"),
  SARVAM_STT_MODEL: z.string().default("saaras:v3"),
  SARVAM_TTS_MODEL: z.string().default("bulbul:v3"),
  CONFIDENCE_THRESHOLD: z.coerce.number().default(0.58),
  FRONTEND_URL: z.string().default("http://localhost:5173")
});

export const env = envSchema.parse(process.env);
