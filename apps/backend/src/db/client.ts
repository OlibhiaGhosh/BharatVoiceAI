import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "../lib/env.js";

const connection = env.DATABASE_URL
  ? postgres(env.DATABASE_URL, { prepare: false })
  : null;

export const db = connection ? drizzle(connection) : null;
