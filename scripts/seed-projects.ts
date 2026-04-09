/**
 * Seed script: populate ProjectManifest and ProjectServiceBinding
 * for infov and laicai projects.
 *
 * Usage: npx tsx scripts/seed-projects.ts
 */

import "dotenv/config";
import { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

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
  await upsertObjectStorageBinding({
    projectKey: "infov",
    runtimeEnv: "dev",
    bucket: process.env.INFOV_DEV_COS_BUCKET ?? process.env.INFOV_COS_BUCKET ?? "infov-dev-bucket-1250000000",
    region: process.env.INFOV_DEV_COS_REGION ?? process.env.INFOV_COS_REGION ?? "ap-guangzhou",
    secretId: process.env.INFOV_DEV_COS_SECRET_ID ?? process.env.INFOV_COS_SECRET_ID ?? "placeholder-secret-id",
    secretKey: process.env.INFOV_DEV_COS_SECRET_KEY ?? process.env.INFOV_COS_SECRET_KEY ?? "placeholder-secret-key",
  });

  await upsertObjectStorageBinding({
    projectKey: "infov",
    runtimeEnv: "prd",
    bucket: process.env.INFOV_PRD_COS_BUCKET ?? process.env.INFOV_COS_BUCKET ?? "infov-prd-bucket-1250000000",
    region: process.env.INFOV_PRD_COS_REGION ?? process.env.INFOV_COS_REGION ?? "ap-guangzhou",
    secretId: process.env.INFOV_PRD_COS_SECRET_ID ?? process.env.INFOV_COS_SECRET_ID ?? "placeholder-secret-id",
    secretKey: process.env.INFOV_PRD_COS_SECRET_KEY ?? process.env.INFOV_COS_SECRET_KEY ?? "placeholder-secret-key",
  });

  await upsertObjectStorageBinding({
    projectKey: "laicai",
    runtimeEnv: "dev",
    bucket: process.env.LAICAI_DEV_COS_BUCKET ?? process.env.LAICAI_COS_BUCKET ?? "laicai-dev-bucket-1250000000",
    region: process.env.LAICAI_DEV_COS_REGION ?? process.env.LAICAI_COS_REGION ?? "ap-shanghai",
    secretId: process.env.LAICAI_DEV_COS_SECRET_ID ?? process.env.LAICAI_COS_SECRET_ID ?? "placeholder-secret-id",
    secretKey: process.env.LAICAI_DEV_COS_SECRET_KEY ?? process.env.LAICAI_COS_SECRET_KEY ?? "placeholder-secret-key",
  });

  await upsertObjectStorageBinding({
    projectKey: "laicai",
    runtimeEnv: "prd",
    bucket: process.env.LAICAI_PRD_COS_BUCKET ?? process.env.LAICAI_COS_BUCKET ?? "laicai-prd-bucket-1250000000",
    region: process.env.LAICAI_PRD_COS_REGION ?? process.env.LAICAI_COS_REGION ?? "ap-shanghai",
    secretId: process.env.LAICAI_PRD_COS_SECRET_ID ?? process.env.LAICAI_COS_SECRET_ID ?? "placeholder-secret-id",
    secretKey: process.env.LAICAI_PRD_COS_SECRET_KEY ?? process.env.LAICAI_COS_SECRET_KEY ?? "placeholder-secret-key",
  });

  console.log("\nSeed complete.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
