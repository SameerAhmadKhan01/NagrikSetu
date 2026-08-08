import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { config } from "./config.js";

const { Pool } = pg;

let prisma: PrismaClient;

if (!config.DATABASE_URL) {
  console.warn("WARNING: DATABASE_URL is not set in environment. Queries needing PostgreSQL will fail. Initializing standard client.");
  prisma = new PrismaClient();
} else {
  try {
    const pool = new Pool({
      connectionString: config.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    const adapter = new PrismaPg(pool);
    prisma = new PrismaClient({ adapter });
  } catch (error) {
    console.error("Failed to initialize PostgreSQL pool:", error);
    prisma = new PrismaClient();
  }
}

export { prisma };
