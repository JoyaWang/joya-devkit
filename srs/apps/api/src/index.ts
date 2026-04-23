/**
 * shared-runtime-services API entry point.
 */

import Fastify from "fastify";
import { loadProjectEnv } from "./env.js";
import { authPreHandler } from "./auth.js";
import { getPrisma } from "./db.js";
import { registerUploadRequestsRoute } from "./routes/upload-requests.js";
import { registerDownloadRequestsRoute } from "./routes/download-requests.js";
import { registerCompleteRoute } from "./routes/complete.js";
import { registerObjectsDeleteRoute } from "./routes/objects-delete.js";
import { registerReleasesRoutes } from "./routes/releases.js";
import { registerAuditLogsRoute } from "./routes/audit-logs.js";
import { registerPublicDeliveryRoute } from "./routes/public-delivery.js";
import { registerFeedbackRoutes } from "./routes/feedback.js";
import { ProjectContextResolver } from "@srs/project-context";
import { ObjectStorageAdapterFactory } from "@srs/object-service";
import { DeliveryPolicyResolver } from "@srs/delivery-policy";
import { checkProjectConsistency, logConsistencyResult } from "./startup-check.js";

loadProjectEnv({ moduleUrl: import.meta.url });

const app = Fastify({ logger: true });

// Create project context resolver and adapter factory
const prisma = getPrisma();
const resolver = new ProjectContextResolver(prisma);
const factory = new ObjectStorageAdapterFactory();

// Create delivery policy resolver for public-stable URL resolution
const deliveryResolver = new DeliveryPolicyResolver({
  publicStableDomains: {
    dev: "https://dl-dev.infinex.cn",
    staging: "https://dl-dev.infinex.cn",
    prod: "https://dl.infinex.cn",
  },
});

// Auth preHandler — runs on all routes except /health
app.addHook("preHandler", async (request, reply) => {
  const routeConfig = (request.routeOptions?.config || {}) as { skipAuth?: boolean };
  if (
    (request.url === "/health" && request.method === "GET") ||
    routeConfig.skipAuth === true
  ) {
    return; // skip auth for health / public delivery routes
  }
  await authPreHandler(request, reply);
});

// Health check — validates env config + DB connectivity
app.get("/health", async (_request, reply) => {
  const checks: Record<string, string> = {};

  // Required env vars
  for (const v of ["DATABASE_URL", "SERVICE_TOKENS"]) {
    checks[v] = process.env[v] ? "ok" : "MISSING";
  }

  // DB connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "FAIL";
  }

  const allOk = Object.values(checks).every((v) => v === "ok");
  const status = allOk ? "ok" : "degraded";

  if (!allOk) {
    reply.code(503);
  }

  return { status, checks, timestamp: new Date().toISOString() };
});

// Register shared public delivery entrypoint before authenticated API routes
await registerPublicDeliveryRoute(app, { resolver, factory });

// Register Object Service routes
const objectRouteDeps = { resolver, factory, deliveryResolver };
await registerUploadRequestsRoute(app, objectRouteDeps);
await registerDownloadRequestsRoute(app, objectRouteDeps);
await registerCompleteRoute(app, objectRouteDeps);
await registerObjectsDeleteRoute(app, objectRouteDeps);

// Register Release Service routes
await registerReleasesRoutes(app);

// Register Audit Logs route
await registerAuditLogsRoute(app);

// Register Feedback Service routes
await registerFeedbackRoutes(app);

// Start
const start = async () => {
  // Run startup consistency check (non-blocking)
  console.log("🔍 Running project consistency check...");
  const consistencyResult = await checkProjectConsistency(prisma);
  logConsistencyResult(consistencyResult);

  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || "0.0.0.0";

  try {
    await app.listen({ port, host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
