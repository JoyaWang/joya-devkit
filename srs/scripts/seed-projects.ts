/**
 * Seed script: populate ProjectManifest and ProjectServiceBinding
 * for infov and laicai projects.
 *
 * Local usage: pnpm run build:seed && pnpm run seed:projects
 * Runtime container usage: node dist-seed/scripts/seed-projects.js
 *
 * Safety: This script is idempotent — it will upsert manifests and bindings,
 * and will NOT delete any existing records.
 */

import "dotenv/config";
import { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveObjectStorageSeedConfig } from "./seed-projects-config.js";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

/**
 * Verify that all required manifests exist before seeding bindings.
 * Returns the list of manifests that were created (if any).
 */
async function ensureManifests(): Promise<string[]> {
  const requiredManifests = [
    { projectKey: "infov", displayName: "InfoV" },
    { projectKey: "laicai", displayName: "Laicai" },
    { projectKey: "unbound", displayName: "Unbound Test Project" },
  ];

  const created: string[] = [];

  for (const manifest of requiredManifests) {
    const existing = await prisma.projectManifest.findUnique({
      where: { projectKey: manifest.projectKey },
    });

    if (!existing) {
      await prisma.projectManifest.create({
        data: {
          projectKey: manifest.projectKey,
          displayName: manifest.displayName,
          status: "active",
        },
      });
      created.push(manifest.projectKey);
      console.log(`✅ Created manifest: ${manifest.projectKey}`);
    } else {
      console.log(`⏭️  Manifest already exists: ${manifest.projectKey} (status: ${existing.status})`);
    }
  }

  return created;
}

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
  console.log("🔍 Checking project manifests...");
  const createdManifests = await ensureManifests();
  if (createdManifests.length > 0) {
    console.log(`\n📋 Created ${createdManifests.length} new manifest(s): ${createdManifests.join(", ")}`);
  } else {
    console.log("\n✅ All required manifests already exist");
  }

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
