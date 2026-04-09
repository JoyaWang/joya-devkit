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
import { ProjectContextResolver } from "@srs/project-context";
import { ObjectStorageAdapterFactory } from "@srs/object-service";

loadProjectEnv({ moduleUrl: import.meta.url });

const app = Fastify({ logger: true });

// Create project context resolver and adapter factory
const prisma = getPrisma();
const resolver = new ProjectContextResolver(prisma);
const factory = new ObjectStorageAdapterFactory();

// Auth preHandler — runs on all routes except /health
app.addHook("preHandler", async (request, reply) => {
  if (request.url === "/health" && request.method === "GET") {
    return; // skip auth for health
  }
  await authPreHandler(request, reply);
});

// Health check
app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// Register Object Service routes
const objectRouteDeps = { resolver, factory };
await registerUploadRequestsRoute(app, objectRouteDeps);
await registerDownloadRequestsRoute(app, objectRouteDeps);
await registerCompleteRoute(app, objectRouteDeps);
await registerObjectsDeleteRoute(app, objectRouteDeps);

// Register Release Service routes
await registerReleasesRoutes(app);

// Register Audit Logs route
await registerAuditLogsRoute(app);

// Start
const start = async () => {
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
