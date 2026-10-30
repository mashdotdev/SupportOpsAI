import "server-only";
import { Pool } from "pg";

const globalDb = globalThis as unknown as { supportPool?: Pool };
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return (globalDb.supportPool ??= new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  }));
}
