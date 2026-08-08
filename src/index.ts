import Fastify from "fastify";
import multipart from "@fastify/multipart";
import jwt from "@fastify/jwt";
import fastifyStatic from "@fastify/static";
import { config, absoluteUploadDir } from "./config.js";
import { schemeRoutes } from "./modules/schemes/router.js";
import { reportRoutes } from "./modules/reports/router.js";
import { chatbotRoutes } from "./modules/chatbot/router.js";
import { adminRoutes } from "./modules/admin/router.js";
import { startEscalationScheduler, stopEscalationScheduler } from "./modules/escalation/scheduler.js";
import { prisma } from "./db.js";

const fastify = Fastify({
  logger: {
    transport: {
      target: "pino-pretty",
      options: {
        translateTime: "HH:MM:ss Z",
        ignore: "pid,hostname",
      },
    },
  },
});

// Register Plugins
// 1. Multipart support for file uploads (audio voice blobs, images, video)
fastify.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// 2. JWT Authentication support
fastify.register(jwt, {
  secret: config.JWT_SECRET,
});

// 3. Static files serving for uploaded grievance media (photos, videos)
fastify.register(fastifyStatic, {
  root: absoluteUploadDir,
  prefix: "/uploads/",
  decorateReply: false,
});

// 4. Static files serving for frontend public portal (HTML, CSS, JS)
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

fastify.register(fastifyStatic, {
  root: path.join(__dirname, "../public"),
  prefix: "/",
  decorateReply: false,
});

// Register Module Routes
fastify.register(schemeRoutes);
fastify.register(reportRoutes);
fastify.register(chatbotRoutes);
fastify.register(adminRoutes);

// Root / Health check route
fastify.get("/health", async () => {
  return { status: "OK", timestamp: new Date() };
});

// Graceful Shutdown orchestration
async function shutdown() {
  fastify.log.info("Shutdown signal received. Starting graceful shutdown sequence...");
  
  // Stop background auto-escalation cron
  stopEscalationScheduler();

  // Close Fastify server connection
  await fastify.close();

  // Disconnect ORM database pool
  await prisma.$disconnect();

  fastify.log.info("Shutdown sequence completed successfully.");
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Bootstrap Server
async function start() {
  try {
    // Start background auto-escalation job scheduler
    startEscalationScheduler();

    await fastify.listen({
      port: config.PORT,
      host: config.HOST,
    });
    console.log(`\n🚀 NagrikSetu Backend running on: http://${config.HOST}:${config.PORT}\n`);
  } catch (err) {
    fastify.log.error(err instanceof Error ? err : new Error(String(err)), "Fatal boot failure");
    process.exit(1);
  }
}

start();
