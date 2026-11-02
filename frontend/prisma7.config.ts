import nextEnv from "@next/env";
import { defineConfig } from "prisma/config";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV === "development");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Optional during generation/build; database commands require this direct URL.
  datasource: { url: process.env.DATABASE_URL_UNPOOLED },
});
