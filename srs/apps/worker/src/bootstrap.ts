/**
 * Worker bootstrap helpers.
 *
 * Loads environment, creates Prisma-backed dependencies,
 * and wires the backfill verification loop.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { ObjectStorageAdapterFactory } from "@srs/object-service";
import {
  startPendingBackfillVerificationLoop,
  type BackfillPrisma,
  type BackfillVerificationLoop,
} from "./backfill-runner.js";
import {
  startFeedbackOutboxLoop,
  type FeedbackOutboxLoop,
  type FeedbackOutboxPrisma,
} from "./feedback-outbox-runner.js";

export { startFeedbackOutboxLoop, type FeedbackOutboxLoop } from "./feedback-outbox-runner.js";

interface LoadProjectEnvOptions {
  cwd?: string;
  moduleUrl?: string;
  maxDepth?: number;
}

interface WorkerPrismaClient extends BackfillPrisma, FeedbackOutboxPrisma {
  $disconnect(): Promise<void>;
}

interface PrismaClientModule {
  PrismaClient: new (args: { adapter: PrismaPg }) => WorkerPrismaClient;
}

export interface WorkerRuntime {
  prisma: WorkerPrismaClient;
  factory: ObjectStorageAdapterFactory;
  backfillLoop: BackfillVerificationLoop;
  feedbackOutboxLoop: FeedbackOutboxLoop;
}

function loadProjectEnv(options: LoadProjectEnvOptions = {}): string[] {
  const cwd = options.cwd ?? process.cwd();
  const maxDepth = options.maxDepth ?? 5;
  const visited = new Set<string>();
  const loaded: string[] = [];

  const searchRoots = [cwd];
  if (options.moduleUrl) {
    searchRoots.push(path.dirname(fileURLToPath(options.moduleUrl)));
  }

  for (const root of searchRoots) {
    let current = path.resolve(root);
    for (let depth = 0; depth <= maxDepth; depth += 1) {
      const envPath = path.join(current, ".env");
      if (!visited.has(envPath)) {
        visited.add(envPath);
        if (fs.existsSync(envPath)) {
          dotenv.config({ path: envPath, override: false });
          loaded.push(envPath);
        }
      }

      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }
  }

  return loaded;
}

async function loadPrismaClientModule(): Promise<PrismaClientModule> {
  const candidates = [
    new URL("../../api/dist/generated/prisma/client.js", import.meta.url),
    new URL("../../api/src/generated/prisma/client.ts", import.meta.url),
  ];

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const mod = (await import(candidate.href)) as PrismaClientModule;
      if (mod.PrismaClient) {
        return mod;
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Failed to load Prisma client for worker runtime");
}

export async function createWorkerRuntime(): Promise<WorkerRuntime> {
  loadProjectEnv({ moduleUrl: import.meta.url });

  const { PrismaClient } = await loadPrismaClientModule();
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });
  const factory = new ObjectStorageAdapterFactory();

  const intervalMs = Number(process.env.BACKFILL_VERIFY_INTERVAL_MS ?? 60_000);
  const backfillLoop = startPendingBackfillVerificationLoop({
    prisma,
    factory,
    intervalMs,
    onError(error) {
      console.error("[worker] backfill verification failed", error);
    },
  });

  const feedbackIntervalMs = Number(process.env.FEEDBACK_OUTBOX_INTERVAL_MS ?? 60_000);
  const feedbackOutboxLoop = startFeedbackOutboxLoop({
    intervalMs: feedbackIntervalMs,
    runOutbox: async () => {
      const { runFeedbackOutbox } = await import("./feedback-outbox-runner.js");
      await runFeedbackOutbox({ prisma: prisma as FeedbackOutboxPrisma });
    },
    onError(error) {
      console.error("[worker] feedback outbox failed", error);
    },
  });

  return {
    prisma,
    factory,
    backfillLoop,
    feedbackOutboxLoop,
  };
}
