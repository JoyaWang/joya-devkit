/**
 * Seed script: populate ProjectManifest and ProjectServiceBinding
 * for infov and laicai projects.
 *
 * Usage: npx tsx scripts/seed-projects.ts
 */

import "dotenv/config";
import { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveObjectStorageSeedConfig } from "./seed-projects-config.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function upsertObjectStorageBinding(params: {
  projectKey: string;
  runtimeEnv: string;
  bucket: string;
  region: string;
  secretId: string;
  secretKey: string;
  downloadDomain?: string;
}) {
  const binding = await prisma.projectServiceBinding.upsert({
    where: {
      projectKey_runtimeEnv_serviceType: {
        projectKey: params.projectKey,
        runtimeEnv: params.runtimeEnv,
        serviceType: "object_storage",
      },
    },
    update: {
      provider: "cos",
      config: JSON.stringify({
        bucket: params.bucket,
        region: params.region,
        secretId: params.secretId,
        secretKey: params.secretKey,
        downloadDomain: params.downloadDomain,
      }),
    },
    create: {
      projectKey: params.projectKey,
      runtimeEnv: params.runtimeEnv,
      serviceType: "object_storage",
      provider: "cos",
      config: JSON.stringify({
        bucket: params.bucket,
        region: params.region,
        secretId: params.secretId,
        secretKey: params.secretKey,
        downloadDomain: params.downloadDomain,
      }),
    },
  });
  console.log("Upserted binding:", binding.projectKey, binding.runtimeEnv, binding.serviceType);
}

async function main() {
  // Seed project manifests
  const infov = await prisma.projectManifest.upsert({
    where: { projectKey: "infov" },
    update: { displayName: "InfoV", status: "active" },
    create: { projectKey: "infov", displayName: "InfoV", status: "active" },
  });
  console.log("Upserted manifest:", infov.projectKey);

  const laicai = await prisma.projectManifest.upsert({
    where: { projectKey: "laicai" },
    update: { displayName: "Laicai", status: "active" },
    create: { projectKey: "laicai", displayName: "Laicai", status: "active" },
  });
  console.log("Upserted manifest:", laicai.projectKey);

  // unbound project: registered but has no object_storage binding (for E2E error test)
  const unbound = await prisma.projectManifest.upsert({
    where: { projectKey: "unbound" },
    update: { displayName: "Unbound Test Project", status: "active" },
    create: { projectKey: "unbound", displayName: "Unbound Test Project", status: "active" },
  });
  console.log("Upserted manifest:", unbound.projectKey);

  // Seed object_storage bindings by project + runtimeEnv
  for (const target of [
    { projectKey: "infov", runtimeEnv: "dev" },
    { projectKey: "infov", runtimeEnv: "prd" },
    { projectKey: "laicai", runtimeEnv: "dev" },
    { projectKey: "laicai", runtimeEnv: "prd" },
  ] as const) {
    const config = resolveObjectStorageSeedConfig({
      projectKey: target.projectKey,
      runtimeEnv: target.runtimeEnv,
      env: process.env,
    });

    await upsertObjectStorageBinding({
      projectKey: target.projectKey,
      runtimeEnv: target.runtimeEnv,
      bucket: config.bucket,
      region: config.region,
      secretId: config.secretId,
      secretKey: config.secretKey,
      downloadDomain: config.downloadDomain,
    });
  }

  console.log("\nSeed complete.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
