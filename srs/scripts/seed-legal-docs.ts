/**
 * Seed script: populate LegalDocument for laicai and infov projects.
 *
 * - Laicai: reads from scripts/legal-docs/laicai/ (original HTML snapshots).
 * - InfoV: reads from scripts/legal-docs/infov/ (dedicated HTML written for InfoV).
 *
 * Local usage: npx tsx scripts/seed-legal-docs.ts
 * Runtime container usage: node dist-seed/scripts/seed-legal-docs.js
 *
 * Safety: This script is idempotent — it will upsert documents.
 */

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "../apps/api/src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  return new PrismaClient({ adapter });
}

// ---------------------------------------------------------------------------
// Document directory resolution helpers
// ---------------------------------------------------------------------------

const LEGAL_DOC_FILENAMES = ["user-agreement.html", "privacy-policy.html"] as const;

function legalDocsBaseHasRequiredFiles(basePath: string): boolean {
  return LEGAL_DOC_FILENAMES.every((filename) => fs.existsSync(path.join(basePath, filename)));
}

function resolveLegalDocsBase(projectKey: string, envVar: string): string {
  if (process.env[envVar]) {
    return path.resolve(process.env[envVar]!);
  }

  const candidates = [
    // Runtime container executes from /app and keeps snapshots at /app/scripts/legal-docs/<project>.
    path.resolve(process.cwd(), `scripts/legal-docs/${projectKey}`),
    // Local tsx execution from this source file directory.
    path.resolve(import.meta.dirname, `legal-docs/${projectKey}`),
    // Compiled dist-seed execution from /app/dist-seed/scripts.
    path.resolve(import.meta.dirname, `../../scripts/legal-docs/${projectKey}`),
  ];
  return candidates.find(legalDocsBaseHasRequiredFiles) ?? candidates[0];
}

const LAICAI_LEGAL_DOCS_BASE = resolveLegalDocsBase("laicai", "LAICAI_LEGAL_DOCS_DIR");
const INFOV_LEGAL_DOCS_BASE = resolveLegalDocsBase("infov", "INFOV_LEGAL_DOCS_DIR");

function readDocument(basePath: string, filename: string): string {
  const filePath = path.join(basePath, filename);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Document not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

// ---------------------------------------------------------------------------
// Main seed function
// ---------------------------------------------------------------------------

async function main() {
  const prisma = createPrismaClient();
  console.log("Seeding legal documents...");

  // Read source documents
  const laicaiUserAgreement = readDocument(LAICAI_LEGAL_DOCS_BASE, "user-agreement.html");
  const laicaiPrivacyPolicy = readDocument(LAICAI_LEGAL_DOCS_BASE, "privacy-policy.html");
  const infovUserAgreement = readDocument(INFOV_LEGAL_DOCS_BASE, "user-agreement.html");
  const infovPrivacyPolicy = readDocument(INFOV_LEGAL_DOCS_BASE, "privacy-policy.html");

  const docs = [
    {
      projectKey: "laicai",
      documentType: "user_agreement",
      title: "来财 App 用户协议",
      contentHtml: laicaiUserAgreement,
      version: "v1.0.0+20",
    },
    {
      projectKey: "laicai",
      documentType: "privacy_policy",
      title: "来财 App 隐私政策",
      contentHtml: laicaiPrivacyPolicy,
      version: "v1.0.0+20",
    },
    {
      projectKey: "infov",
      documentType: "user_agreement",
      title: "家信柜（InfoV）用户协议",
      contentHtml: infovUserAgreement,
      version: "v1.0.1+27",
    },
    {
      projectKey: "infov",
      documentType: "privacy_policy",
      title: "家信柜（InfoV）隐私政策",
      contentHtml: infovPrivacyPolicy,
      version: "v1.0.1+27",
    },
  ];

  // Upsert all documents
  for (const doc of docs) {
    const result = await prisma.legalDocument.upsert({
      where: {
        projectKey_documentType: {
          projectKey: doc.projectKey,
          documentType: doc.documentType,
        },
      },
      create: doc,
      update: {
        title: doc.title,
        contentHtml: doc.contentHtml,
        version: doc.version,
      },
    });
    console.log(`  Upserted: ${doc.projectKey}/${doc.documentType} (id: ${result.id})`);
  }

  console.log("Legal document seeding complete.");
  await prisma.$disconnect();
}

if (import.meta.url === pathToFileURL(path.resolve(process.argv[1] ?? "")).href) {
  main().catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
}

export { readDocument, LAICAI_LEGAL_DOCS_BASE, INFOV_LEGAL_DOCS_BASE };
