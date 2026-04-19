/**
 * Worker entry point.
 *
 * Current phase: starts the process, loads runtime dependencies,
 * and runs the pending backfill verification loop on an interval.
 */

import { createWorkerRuntime } from "./bootstrap.js";

let runtime: Awaited<ReturnType<typeof createWorkerRuntime>> | null = null;

const shutdown = async (signal: string) => {
  console.log(`[worker] received ${signal}, shutting down`);
  runtime?.backfillLoop.stop();
  runtime?.feedbackOutboxLoop.stop();
  await runtime?.prisma.$disconnect();
  process.exit(0);
};

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});
process.on("SIGINT", () => {
  void shutdown("SIGINT");
});

const start = async () => {
  runtime = await createWorkerRuntime();
  console.log("[worker] started, backfill verification loop and feedback outbox loop running...");
};

void start();
