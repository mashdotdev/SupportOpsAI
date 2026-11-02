import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalDb = globalThis as unknown as { supportPrisma?: PrismaClient };
export function database() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  return (globalDb.supportPrisma ??= new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 10000,
    }),
  }));
}
