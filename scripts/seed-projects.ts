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

  // Seed object_storage bindings
  // These use placeholder COS config for local dev; in production,
  // real credentials will be injected via admin-platform.
  const infovCosBucket = process.env.INFOV_COS_BUCKET ?? "infov-dev-bucket-1250000000";
  const infovCosRegion = process.env.INFOV_COS_REGION ?? "ap-guangzhou";
  const infovCosSecretId = process.env.INFOV_COS_SECRET_ID ?? "placeholder-secret-id";
  const infovCosSecretKey = process.env.INFOV_COS_SECRET_KEY ?? "placeholder-secret-key";

  const infovBinding = await prisma.projectServiceBinding.upsert({
    where: {
      projectKey_serviceType: { projectKey: "infov", serviceType: "object_storage" },
    },
    update: {
      provider: "cos",
      config: JSON.stringify({
        bucket: infovCosBucket,
        region: infovCosRegion,
        secretId: infovCosSecretId,
        secretKey: infovCosSecretKey,
      }),
    },
    create: {
      projectKey: "infov",
      serviceType: "object_storage",
      provider: "cos",
      config: JSON.stringify({
        bucket: infovCosBucket,
        region: infovCosRegion,
        secretId: infovCosSecretId,
        secretKey: infovCosSecretKey,
      }),
    },
  });
  console.log("Upserted binding:", infovBinding.projectKey, infovBinding.serviceType);

  const laicaiCosBucket = process.env.LAICAI_COS_BUCKET ?? "laicai-dev-bucket-1250000000";
  const laicaiCosRegion = process.env.LAICAI_COS_REGION ?? "ap-shanghai";
  const laicaiCosSecretId = process.env.LAICAI_COS_SECRET_ID ?? "placeholder-secret-id";
  const laicaiCosSecretKey = process.env.LAICAI_COS_SECRET_KEY ?? "placeholder-secret-key";

  const laicaiBinding = await prisma.projectServiceBinding.upsert({
    where: {
      projectKey_serviceType: { projectKey: "laicai", serviceType: "object_storage" },
    },
    update: {
      provider: "cos",
      config: JSON.stringify({
        bucket: laicaiCosBucket,
        region: laicaiCosRegion,
        secretId: laicaiCosSecretId,
        secretKey: laicaiCosSecretKey,
      }),
    },
    create: {
      projectKey: "laicai",
      serviceType: "object_storage",
      provider: "cos",
      config: JSON.stringify({
        bucket: laicaiCosBucket,
        region: laicaiCosRegion,
        secretId: laicaiCosSecretId,
        secretKey: laicaiCosSecretKey,
      }),
    },
  });
  console.log("Upserted binding:", laicaiBinding.projectKey, laicaiBinding.serviceType);

  console.log("\nSeed complete.");
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
