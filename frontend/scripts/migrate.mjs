import nextEnv from "@next/env";
import { readFile } from "node:fs/promises";
import pg from "pg";

nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL_UNPOOLED) throw new Error("DATABASE_URL_UNPOOLED is required");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL_UNPOOLED });
try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(await readFile(new URL("../migrations/001_support_tickets.sql", import.meta.url), "utf8"));
  await client.query("COMMIT");
  console.log("PASS: support_tickets migration applied using direct Postgres connection");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  throw error;
} finally { await client.end(); }
