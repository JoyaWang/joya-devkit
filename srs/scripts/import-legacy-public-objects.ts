#!/usr/bin/env node
/**
 * SRS CLI: import legacy public objects metadata/backfill.
 *
 * Reads JSONL input (lines with `{"url":"https://dl.infinex.cn/laicai/prd/...","source":"listings"}`
 * or `{"objectKey":"laicai/prd/post/attachment/...","entityId":"2042583502301429760"}`),
 * creates/repairs Object records + storage locations + audit logs
 * for legacy public objects that exist at the provider/origin but lack SRS metadata.
 *
 * Safety:
 * - dry-run is the DEFAULT. Pass `--dry-run=false` to write to the database.
 * - Rollback is constrained by run-id, profile, and purpose -- no provider files are deleted.
 *
 * Usage:
 *   pnpm run build:seed &&
 *   node dist-seed/scripts/import-legacy-public-objects.js \
 *     --input /path/to/input.jsonl \
 *     --dry-run=true
 *
 * Rollback:
 *   node dist-seed/scripts/import-legacy-public-objects.js \
 *     --rollback-run-id=<run-id> \
 *     --dry-run=true   # default
 */

import "dotenv/config";
import { createInterface } from "node:readline";
import { createReadStream, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export interface ImportLine {
  /** Full public URL of the legacy object (e.g. https://dl.infinex.cn/laicai/prd/...) */
  url?: string;
  /** Direct objectKey (alternative to url) */
  objectKey?: string;
  /** Source system identifier e.g. "listings", "profile" */
  source?: string;
  /** Entity ID in the source system */
  entityId?: string;
}

export interface ImportOptions {
  /** Input file path (omit for stdin) */
  input?: string;
  /** When true only simulate -- no DB writes */
  dryRun: boolean;
  /** Allowed host prefix to strip from URLs */
  allowedHost: string;
  /** Project key */
  project: string;
  /** Comma-separated list of allowed env segments in objectKey path */
  allowedKeyEnv: string;
  /** Runtime environment for binding resolution and Object.env */
  runtimeEnv: string;
  /** Run identifier */
  runId: string;
}

export interface ImportResult {
  dryRun: boolean;
  runId: string;
  scanned: number;
  valid: number;
  invalid: number;
  skippedMissingInStorage: number;
  created: number;
  repaired: number;
  unchanged: number;
  rolledBack: number;
  errors: Array<{ line: number; objectKey: string; error: string }>;
}

export interface RollbackOptions {
  dryRun: boolean;
  runId: string;
}

export interface RollbackResult {
  dryRun: boolean;
  runId: string;
  affected: number;
  objectsDeactivated: number;
  locationsDeactivated: number;
  auditLogsWritten: number;
}

// ---------------------------------------------------------------------------
// Database client interface (subset of PrismaClient methods used by import)
// ---------------------------------------------------------------------------

export interface DbClient {
  object: {
    findUnique(args: { where: { objectKey: string } }): Promise<Record<string, any> | null>;
    create(args: { data: Record<string, any> }): Promise<Record<string, any>>;
    update(args: { where: { id: string }; data: Record<string, any> }): Promise<Record<string, any>>;
    findMany(args: { where: Record<string, any> }): Promise<Array<Record<string, any>>>;
  };
  objectStorageLocation: {
    findFirst(args: { where: Record<string, any>; orderBy?: Record<string, string> }): Promise<Record<string, any> | null>;
    create(args: { data: Record<string, any> }): Promise<Record<string, any>>;
    update(args: { where: { id: string }; data: Record<string, any> }): Promise<Record<string, any>>;
    findMany(args: { where: Record<string, any> }): Promise<Array<Record<string, any>>>;
  };
  auditLog: {
    create(args: { data: Record<string, any> }): Promise<Record<string, any>>;
  };
}

export interface Resolver {
  resolve(projectKey: string, runtimeEnv: string, serviceType: string): Promise<{
    manifest: { projectKey: string; status: string };
    binding: {
      id: string; projectKey: string; runtimeEnv: string; serviceType: string;
      provider: string; config: string; createdAt: Date; updatedAt: Date;
    };
  }>;
}

export interface AdapterFactory {
  getOrCreate(binding: { id: string; projectKey: string; runtimeEnv: string; serviceType: string; provider: string; config: string }): {
    headObject(input: { objectKey: string }): Promise<{ exists: boolean; size?: number; contentType?: string }>;
  };
}

export interface ImportDeps {
  resolver: Resolver;
  factory: AdapterFactory;
  now: () => Date;
}

// ---------------------------------------------------------------------------
// Inline validateObjectKeyFormat
// (mirrors the source at packages/object-service/src/scopes.ts)
// ---------------------------------------------------------------------------

function validateObjectKeyFormat(objectKey: string): { valid: boolean; error?: string } {
  const parts = objectKey.split("/");
  if (parts.length < 9) {
    return { valid: false, error: `objectKey format invalid: expected at least 9 path segments, got ${parts.length}` };
  }
  const [project, env, domain, scope, entityId, fileKind, year, month] = parts;
  if (!project || !env || !domain || !scope || !entityId || !fileKind) {
    return { valid: false, error: "objectKey contains empty segments" };
  }
  if (!/^\d{4}$/.test(year)) {
    return { valid: false, error: `objectKey year segment must be 4 digits, got "${year}"` };
  }
  if (!/^\d{2}$/.test(month)) {
    return { valid: false, error: `objectKey month segment must be 2 digits, got "${month}"` };
  }
  return { valid: true };
}

// ---------------------------------------------------------------------------
// URL to objectKey extraction
// ---------------------------------------------------------------------------

/**
 * Extract an objectKey from a legacy URL.
 *
 * Example:
 *   url: "https://dl.infinex.cn/laicai/prd/post/attachment/.../file.jpg?q=1#hash"
 *   allowedHost: "dl.infinex.cn"
 *   Returns: "laicai/prd/post/attachment/.../file.jpg"
 */
export function extractObjectKeyFromUrl(url: string, allowedHost: string): string {
  let cleaned = url.trim();

  // Strip query/hash
  const qIndex = cleaned.indexOf("?");
  if (qIndex !== -1) cleaned = cleaned.substring(0, qIndex);
  const hIndex = cleaned.indexOf("#");
  if (hIndex !== -1) cleaned = cleaned.substring(0, hIndex);

  // Strip protocol + leading //
  const protoMatch = cleaned.match(/^https?:\/\//);
  if (!protoMatch) {
    throw new Error(`URL must have an http(s) scheme: "${url}"`);
  }
  cleaned = cleaned.slice(protoMatch[0].length);

  // Strip host
  if (!cleaned.startsWith(allowedHost)) {
    throw new Error(
      `URL host does not match allowed host "${allowedHost}": "${url}"`,
    );
  }
  cleaned = cleaned.slice(allowedHost.length);

  // Strip leading /
  if (cleaned.startsWith("/")) {
    cleaned = cleaned.slice(1);
  }

  if (!cleaned) {
    throw new Error(`URL produced empty objectKey: "${url}"`);
  }

  return cleaned;
}

// ---------------------------------------------------------------------------
// ObjectKey segment parsing
// ---------------------------------------------------------------------------

export interface ParsedObjectKey {
  projectKey: string;
  keyEnv: string;
  domain: string;
  scope: string;
  entityId: string;
  fileKind: string;
  year: string;
  month: string;
  fileName: string;
}

/**
 * Parse objectKey into its meaningful segments.
 *
 * Format: {project}/{env}/{domain}/{scope}/{entityId}/{fileKind}/{YYYY}/{MM}/{fileName}
 *
 * Example: "laicai/prd/post/attachment/2042583502301429760/image/2026/04/751e4fc9-thumb.jpg"
 *   -> { projectKey: "laicai", keyEnv: "prd", domain: "post", scope: "attachment",
 *        entityId: "2042583502301429760", fileKind: "image", year: "2026", month: "04",
 *        fileName: "751e4fc9-thumb.jpg" }
 */
export function parseObjectKey(objectKey: string): ParsedObjectKey {
  const parts = objectKey.split("/");
  if (parts.length < 9) {
    throw new Error(
      `objectKey must have at least 9 path segments, got ${parts.length}: "${objectKey}"`,
    );
  }
  const [projectKey, keyEnv, domain, scope, entityId, fileKind, year, month] = parts;
  const fileName = parts.slice(8).join("/");

  if (!projectKey || !keyEnv || !domain || !scope || !entityId || !fileKind || !fileName) {
    throw new Error(`objectKey contains empty segments: "${objectKey}"`);
  }

  return {
    projectKey, keyEnv, domain, scope, entityId, fileKind, year, month, fileName,
  };
}

// ---------------------------------------------------------------------------
// Core import logic
// ---------------------------------------------------------------------------

export async function importLegacyPublicObjectsFromLines(
  lines: ImportLine[],
  db: DbClient,
  deps: ImportDeps,
  options: ImportOptions,
): Promise<ImportResult> {
  const result: ImportResult = {
    dryRun: options.dryRun,
    runId: options.runId,
    scanned: 0,
    valid: 0,
    invalid: 0,
    skippedMissingInStorage: 0,
    created: 0,
    repaired: 0,
    unchanged: 0,
    rolledBack: 0,
    errors: [],
  };

  const allowedEnvSet = new Set(
    options.allowedKeyEnv.split(",").map((s) => s.trim()).filter(Boolean),
  );

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    result.scanned++;

    let objectKey: string;

    try {
      // Step 1: Extract objectKey from url or use directly
      if (line.url) {
        objectKey = extractObjectKeyFromUrl(line.url, options.allowedHost);
      } else if (line.objectKey) {
        objectKey = line.objectKey.trim();
      } else {
        result.invalid++;
        result.errors.push({
          line: lineNum,
          objectKey: "",
          error: "Line must contain either 'url' or 'objectKey'",
        });
        continue;
      }
    } catch (err: any) {
      result.invalid++;
      result.errors.push({
        line: lineNum,
        objectKey: line.objectKey || line.url || "",
        error: err.message || String(err),
      });
      continue;
    }

    // Step 2: Validate objectKey format
    const formatResult = validateObjectKeyFormat(objectKey);
    if (!formatResult.valid) {
      result.invalid++;
      result.errors.push({
        line: lineNum,
        objectKey,
        error: formatResult.error || "Invalid objectKey format",
      });
      continue;
    }

    // Step 3: Validate that the env segment is in the allowed list
    let parsed: ParsedObjectKey;
    try {
      parsed = parseObjectKey(objectKey);
    } catch (err: any) {
      result.invalid++;
      result.errors.push({
        line: lineNum,
        objectKey,
        error: err.message || String(err),
      });
      continue;
    }

    if (!allowedEnvSet.has(parsed.keyEnv)) {
      result.invalid++;
      result.errors.push({
        line: lineNum,
        objectKey,
        error: `ObjectKey env segment "${parsed.keyEnv}" is not in allowed envs: ${options.allowedKeyEnv}`,
      });
      continue;
    }

    result.valid++;

    // Step 4: Resolve project binding
    let binding: { id: string; projectKey: string; runtimeEnv: string; serviceType: string; provider: string; config: string };
    try {
      const ctx = await deps.resolver.resolve(
        options.project,
        options.runtimeEnv,
        "object_storage",
      );
      binding = ctx.binding;
    } catch (err: any) {
      result.errors.push({
        line: lineNum,
        objectKey,
        error: `Binding resolution failed: ${err.message || String(err)}`,
      });
      continue;
    }

    // Step 5: headObject to check physical existence
    let headResult: { exists: boolean; size?: number; contentType?: string };
    try {
      const adapter = deps.factory.getOrCreate(binding);
      headResult = await adapter.headObject({ objectKey });
    } catch (err: any) {
      result.errors.push({
        line: lineNum,
        objectKey,
        error: `headObject failed: ${err.message || String(err)}`,
      });
      continue;
    }

    if (!headResult.exists) {
      result.skippedMissingInStorage++;
      continue;
    }

    // Step 6: Build object record data
    const objectData: Record<string, any> = {
      projectKey: options.project,
      env: options.runtimeEnv,
      domain: parsed.domain,
      scope: parsed.scope,
      entityId: parsed.entityId,
      fileKind: parsed.fileKind,
      objectKey,
      fileName: parsed.fileName,
      contentType: headResult.contentType || "application/octet-stream",
      size: headResult.size || 0,
      checksum: null,
      visibility: "public",
      objectProfile: "legacy_public_delivery",
      accessClass: "public-stable",
      uploaderType: "legacy_import",
      uploaderId: options.runId,
      status: "active",
      purpose: `legacy_public_delivery_import:${options.runId}`,
    };

    // Step 7: Check if object already exists in DB (idempotency)
    const existingObj = await db.object.findUnique({ where: { objectKey } });

    if (existingObj) {
      // Object already has a record -- check if it needs repair
      const existingLocation = await db.objectStorageLocation.findFirst({
        where: { objectId: existingObj.id, locationRole: "primary", status: "active" },
        orderBy: { createdAt: "desc" },
      });

      if (existingLocation) {
        // Already fully imported -- skip
        result.unchanged++;
      } else {
        // Repair: create the missing primary location
        if (!options.dryRun) {
          await db.objectStorageLocation.create({
            data: {
              objectId: existingObj.id,
              bindingId: binding.id,
              provider: binding.provider,
              locationRole: "primary",
              status: "active",
            },
          });
          await db.auditLog.create({
            data: {
              action: "legacy_public_object_import",
              actorType: "legacy_import",
              actorId: options.runId,
              resource: objectKey,
              detail: JSON.stringify({
                status: "repaired",
                existingObjectId: existingObj.id,
                bindingId: binding.id,
                runId: options.runId,
              }),
            },
          });
        }
        result.repaired++;
      }
    } else {
      // Create new object + location + audit
      if (!options.dryRun) {
        const created = await db.object.create({ data: objectData });

        await db.objectStorageLocation.create({
          data: {
            objectId: created.id,
            bindingId: binding.id,
            provider: binding.provider,
            locationRole: "primary",
            status: "active",
          },
        });

        await db.auditLog.create({
          data: {
            action: "legacy_public_object_import",
            actorType: "legacy_import",
            actorId: options.runId,
            resource: objectKey,
            detail: JSON.stringify({
              status: "created",
              objectId: created.id,
              bindingId: binding.id,
              runId: options.runId,
            }),
          },
        });
      }
      result.created++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Rollback
// ---------------------------------------------------------------------------

export async function rollbackLegacyPublicImport(
  db: DbClient,
  deps: { now: () => Date },
  options: RollbackOptions,
): Promise<RollbackResult> {
  const result: RollbackResult = {
    dryRun: options.dryRun,
    runId: options.runId,
    affected: 0,
    objectsDeactivated: 0,
    locationsDeactivated: 0,
    auditLogsWritten: 0,
  };

  const purpose = `legacy_public_delivery_import:${options.runId}`;

  const objects = await db.object.findMany({
    where: {
      objectProfile: "legacy_public_delivery",
      purpose,
      status: { not: "deleted" },
    },
  });

  for (const obj of objects) {
    result.affected++;

    if (!options.dryRun) {
      const now = deps.now();

      // Mark object as deleted
      await db.object.update({
        where: { id: obj.id },
        data: { status: "deleted", deletedAt: now },
      });
      result.objectsDeactivated++;

      // Deactivate all active locations
      const locations = await db.objectStorageLocation.findMany({
        where: { objectId: obj.id, status: "active" },
      });
      for (const loc of locations) {
        await db.objectStorageLocation.update({
          where: { id: loc.id },
          data: { status: "inactive" },
        });
        result.locationsDeactivated++;
      }

      // Write audit log
      await db.auditLog.create({
        data: {
          action: "legacy_public_object_rollback",
          actorType: "legacy_import",
          actorId: options.runId,
          resource: obj.objectKey,
          detail: JSON.stringify({
            rollbackRunId: options.runId,
            objectId: obj.id,
            type: "rollback",
          }),
        },
      });
      result.auditLogsWritten++;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// JSONL input reader
// ---------------------------------------------------------------------------

async function readJsonlLines(inputPath?: string): Promise<ImportLine[]> {
  const lines: ImportLine[] = [];

  const rl = inputPath
    ? createInterface({ input: createReadStream(inputPath, "utf-8"), crlfDelay: Infinity })
    : createInterface({ input: process.stdin, crlfDelay: Infinity });

  for await (const rawLine of rl) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      continue;
    }
    try {
      const parsed = JSON.parse(trimmed) as ImportLine;
      lines.push(parsed);
    } catch {
      // Skip malformed lines but count them
      console.error(`[WARN] Skipping malformed JSON line: ${trimmed}`);
    }
  }

  return lines;
}

// ---------------------------------------------------------------------------
// CLI arg parser
// ---------------------------------------------------------------------------

function parseArgv(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        const key = arg.slice(2, eqIdx);
        const value = arg.slice(eqIdx + 1);
        args[key] = value;
      } else {
        args[arg.slice(2)] = "true";
      }
    }
  }
  return args;
}

// ---------------------------------------------------------------------------
// CLI main entrypoint
// ---------------------------------------------------------------------------

async function main() {
  const cliArgs = parseArgv(process.argv);

  const input = cliArgs.input;
  const rawDryRun = cliArgs["dry-run"] ?? "true";
  const allowedHost = cliArgs["allowed-host"] ?? "dl.infinex.cn";
  const project = cliArgs.project ?? "laicai";
  const allowedKeyEnv = cliArgs["allowed-key-env"] ?? "prd,prod";
  const runtimeEnv = cliArgs["runtime-env"] ?? "prod";
  const runId = cliArgs["run-id"] ?? `run-${Date.now()}`;

  const isRollback = cliArgs["rollback-run-id"] !== undefined;
  const rollbackRunId = cliArgs["rollback-run-id"];
  const dryRun = rawDryRun !== "false";

  if (input && !existsSync(input)) {
    console.error(`[FATAL] Input file not found: ${input}`);
    process.exit(1);
  }

  // Dynamic imports from the prisma client and workspace packages.
  // These are resolved at runtime via the compiled dist-seed output
  // and pnpm workspace links.
  const { PrismaClient } = await import("../apps/api/src/generated/prisma/client.js");
  const { PrismaPg } = await import("@prisma/adapter-pg");

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  try {
    if (isRollback) {
      if (!rollbackRunId) {
        console.error("[FATAL] --rollback-run-id is required for rollback");
        process.exit(1);
      }
      console.error(`[INFO] Rollback mode: run-id=${rollbackRunId}, dryRun=${dryRun}`);

      const result = await rollbackLegacyPublicImport(
        prisma as unknown as DbClient,
        { now: () => new Date() },
        { dryRun, runId: rollbackRunId },
      );

      console.log(JSON.stringify(result, null, 2));
    } else {
      const lines = await readJsonlLines(input);

      console.error(`[INFO] Read ${lines.length} input lines, dryRun=${dryRun}, project=${project}, runtimeEnv=${runtimeEnv}`);

      // Directly query the binding and build the adapter inline,
      // avoiding @srs/* workspace package imports at seed-script compile time.
      const bindingRow = await prisma.projectServiceBinding.findUnique({
        where: {
          projectKey_runtimeEnv_serviceType: {
            projectKey: project,
            runtimeEnv,
            serviceType: "object_storage",
          },
        },
      });

      if (!bindingRow) {
        console.error(`[FATAL] No object_storage binding found for project=${project}, runtimeEnv=${runtimeEnv}`);
        process.exit(1);
      }

      // Build a lightweight resolver/adapter interface around the direct Prisma query
      const resolver: Resolver = {
        resolve: async (pk: string, re: string, st: string) => {
          const row = await prisma.projectServiceBinding.findUnique({
            where: {
              projectKey_runtimeEnv_serviceType: {
                projectKey: pk,
                runtimeEnv: re,
                serviceType: st,
              },
            },
          });
          if (!row) {
            throw new Error(`No binding found for ${pk}/${re}/${st}`);
          }
          return {
            manifest: { projectKey: pk, status: "active" },
            binding: {
              id: row.id,
              projectKey: row.projectKey,
              runtimeEnv: row.runtimeEnv,
              serviceType: row.serviceType,
              provider: row.provider,
              config: row.config,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
            },
          };
        },
      };

      // Build the adapter factory using the CosObjectStorageAdapter
      // Use absolute path resolution so it works both at seed build time (tsc -> dist-seed)
      // and at runtime (node dist-seed/scripts/...).
      const __dirname = dirname(fileURLToPath(import.meta.url));
      const { CosObjectStorageAdapter } = await import(
        resolve(__dirname, "../../packages/object-service/dist/index.js")
      );

      const factory: AdapterFactory = {
        getOrCreate: (binding: any) => {
          const config = JSON.parse(binding.config);
          return new CosObjectStorageAdapter({ config });
        },
      };

      const result = await importLegacyPublicObjectsFromLines(
        lines,
        prisma as unknown as DbClient,
        { resolver, factory, now: () => new Date() },
        {
          input,
          dryRun,
          allowedHost,
          project,
          allowedKeyEnv,
          runtimeEnv,
          runId,
        },
      );

      console.log(JSON.stringify(result, null, 2));
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Only run as CLI if this is the entrypoint
const isMainModule = process.argv[1]?.endsWith("import-legacy-public-objects.js")
  || process.argv[1]?.endsWith("import-legacy-public-objects.ts");

if (isMainModule) {
  main().catch((err) => {
    console.error("[FATAL]", err);
    process.exit(1);
  });
}

export { main };
