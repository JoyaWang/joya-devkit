/**
 * Tests for legacy public object metadata import/backfill CLI.
 *
 * Covers:
 * - URL-to-objectKey extraction
 * - ObjectKey segment parsing
 * - Dry-run safety (default)
 * - Invalid line / format / env filtering
 * - Missing physical object skip
 * - Create / repair / unchanged idempotency
 * - Rollback scope constraints
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  extractObjectKeyFromUrl,
  parseObjectKey,
  importLegacyPublicObjectsFromLines,
  rollbackLegacyPublicImport,
  type ImportLine,
  type DbClient,
  type ImportDeps,
} from "../scripts/import-legacy-public-objects.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockDb(): DbClient {
  return {
    object: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "new-obj-001" }),
      update: vi.fn().mockResolvedValue(undefined),
      findMany: vi.fn().mockResolvedValue([]),
    },
    objectStorageLocation: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: "new-loc-001" }),
      update: vi.fn().mockResolvedValue(undefined),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-001" }),
    },
  };
}

function makeMockDeps(headExists: boolean = true): ImportDeps {
  return {
    resolver: {
      resolve: vi.fn().mockResolvedValue({
        manifest: { projectKey: "laicai", status: "active" },
        binding: {
          id: "binding-laicai-prod",
          projectKey: "laicai",
          runtimeEnv: "prod",
          serviceType: "object_storage",
          provider: "cos",
          config: "{}",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    },
    factory: {
      getOrCreate: vi.fn().mockReturnValue({
        headObject: vi.fn().mockResolvedValue({
          exists: headExists,
          size: 12345,
          contentType: "image/jpeg",
        }),
      }),
    },
    now: () => new Date("2026-04-01T12:00:00.000Z"),
  };
}

const DEFAULT_OPTIONS = {
  dryRun: false,
  allowedHost: "dl.infinex.cn",
  project: "laicai",
  allowedKeyEnv: "prd,prod",
  runtimeEnv: "prod",
  runId: "test-run-001",
};

const VALID_OBJECT_KEY =
  "laicai/prd/post/attachment/2042583502301429760/image/2026/04/751e4fc9-thumb.jpg";

// ---------------------------------------------------------------------------
// extractObjectKeyFromUrl
// ---------------------------------------------------------------------------

describe("extractObjectKeyFromUrl", () => {
  it("extracts objectKey from a full URL", () => {
    const result = extractObjectKeyFromUrl(
      `https://dl.infinex.cn/${VALID_OBJECT_KEY}`,
      "dl.infinex.cn",
    );
    expect(result).toBe(VALID_OBJECT_KEY);
  });

  it("strips query parameters", () => {
    const result = extractObjectKeyFromUrl(
      `https://dl.infinex.cn/${VALID_OBJECT_KEY}?t=123&sig=abc`,
      "dl.infinex.cn",
    );
    expect(result).toBe(VALID_OBJECT_KEY);
  });

  it("strips hash fragment", () => {
    const result = extractObjectKeyFromUrl(
      `https://dl.infinex.cn/${VALID_OBJECT_KEY}#section`,
      "dl.infinex.cn",
    );
    expect(result).toBe(VALID_OBJECT_KEY);
  });

  it("throws on non-matching host", () => {
    expect(() =>
      extractObjectKeyFromUrl(
        `https://evil.com/${VALID_OBJECT_KEY}`,
        "dl.infinex.cn",
      ),
    ).toThrow("does not match allowed host");
  });

  it("throws on missing URL scheme", () => {
    expect(() =>
      extractObjectKeyFromUrl(
        `dl.infinex.cn/${VALID_OBJECT_KEY}`,
        "dl.infinex.cn",
      ),
    ).toThrow("URL must have an http(s) scheme");
  });

  it("throws on empty result", () => {
    expect(() =>
      extractObjectKeyFromUrl("https://dl.infinex.cn/", "dl.infinex.cn"),
    ).toThrow("empty objectKey");
  });
});

// ---------------------------------------------------------------------------
// parseObjectKey
// ---------------------------------------------------------------------------

describe("parseObjectKey", () => {
  it("parses a valid objectKey", () => {
    const result = parseObjectKey(VALID_OBJECT_KEY);
    expect(result.projectKey).toBe("laicai");
    expect(result.keyEnv).toBe("prd");
    expect(result.domain).toBe("post");
    expect(result.scope).toBe("attachment");
    expect(result.entityId).toBe("2042583502301429760");
    expect(result.fileKind).toBe("image");
    expect(result.year).toBe("2026");
    expect(result.month).toBe("04");
    expect(result.fileName).toBe("751e4fc9-thumb.jpg");
  });

  it("handles avatar objectKey", () => {
    const key =
      "laicai/prd/member/avatar/2042583502301429760/image/2026/04/90002d6d-avatar_1776434647017_171.jpg";
    const result = parseObjectKey(key);
    expect(result.domain).toBe("member");
    expect(result.scope).toBe("avatar");
  });

  it("throws when objectKey has too few segments", () => {
    expect(() => parseObjectKey("laicai/prd/post/attachment")).toThrow(
      "at least 9 path segments",
    );
  });

  it("throws on empty segments", () => {
    expect(() =>
      parseObjectKey("laicai/prd//attachment/entity/fileKind/2026/04/file.jpg"),
    ).toThrow("contains empty segments");
  });
});

// ---------------------------------------------------------------------------
// importLegacyPublicObjectsFromLines
// ---------------------------------------------------------------------------

describe("importLegacyPublicObjectsFromLines", () => {
  let mockDb: DbClient;
  let mockDeps: ImportDeps;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeMockDb();
    mockDeps = makeMockDeps(true);
  });

  it("default dry-run=true does not write to DB", async () => {
    const lines: ImportLine[] = [{ url: `https://dl.infinex.cn/${VALID_OBJECT_KEY}` }];
    const result = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, {
      ...DEFAULT_OPTIONS,
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(result.scanned).toBe(1);
    expect(result.invalid).toBe(0);
    expect(result.created).toBe(1);
    expect(result.valid).toBe(1);
    expect(mockDb.object.create).not.toHaveBeenCalled();
    expect(mockDb.objectStorageLocation.create).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it("skips lines with neither url nor objectKey", async () => {
    const lines: ImportLine[] = [{ source: "listings" }];
    const result = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);

    expect(result.scanned).toBe(1);
    expect(result.invalid).toBe(1);
    expect(result.errors[0].error).toContain("must contain either");
  });

  it("skips invalid objectKey format", async () => {
    const lines: ImportLine[] = [{ objectKey: "too/short" }];
    const result = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);

    expect(result.scanned).toBe(1);
    expect(result.invalid).toBe(1);
    expect(result.errors[0].error).toContain("objectKey format invalid");
  });

  it("skips objectKey with env not in allowed list", async () => {
    const lines: ImportLine[] = [
      { objectKey: "laicai/dev/post/attachment/entity/fileKind/2026/04/file.jpg" },
    ];
    const result = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);

    expect(result.scanned).toBe(1);
    expect(result.invalid).toBe(1);
    expect(result.errors[0].error).toContain("not in allowed envs");
  });

  it("skips object when headObject returns exists=false", async () => {
    mockDeps = makeMockDeps(false); // headObject returns { exists: false }

    const lines: ImportLine[] = [{ url: `https://dl.infinex.cn/${VALID_OBJECT_KEY}` }];
    const result = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);

    expect(result.scanned).toBe(1);
    expect(result.skippedMissingInStorage).toBe(1);
    expect(result.created).toBe(0);
    expect(mockDb.object.create).not.toHaveBeenCalled();
  });

  it("creates new object when physical object exists in storage", async () => {
    const lines: ImportLine[] = [{ url: `https://dl.infinex.cn/${VALID_OBJECT_KEY}` }];
    const result = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);

    expect(result.scanned).toBe(1);
    expect(result.valid).toBe(1);
    expect(result.created).toBe(1);
    expect(mockDb.object.create).toHaveBeenCalledTimes(1);
    expect(mockDb.objectStorageLocation.create).toHaveBeenCalledTimes(1);
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);

    // Verify object data
    const createCall = (mockDb.object.create as any).mock.calls[0][0].data;
    expect(createCall.objectKey).toBe(VALID_OBJECT_KEY);
    expect(createCall.projectKey).toBe("laicai");
    expect(createCall.env).toBe("prod"); // runtime env, not "prd"
    expect(createCall.visibility).toBe("public");
    expect(createCall.accessClass).toBe("public-stable");
    expect(createCall.objectProfile).toBe("legacy_public_delivery");
    expect(createCall.purpose).toBe("legacy_public_delivery_import:test-run-001");
    expect(createCall.uploaderType).toBe("legacy_import");
    expect(createCall.uploaderId).toBe("test-run-001");

    // Verify location
    const locCall = (mockDb.objectStorageLocation.create as any).mock.calls[0][0].data;
    expect(locCall.objectId).toBe("new-obj-001");
    expect(locCall.bindingId).toBe("binding-laicai-prod");
    expect(locCall.locationRole).toBe("primary");
    expect(locCall.status).toBe("active");

    // Verify audit
    const auditCall = (mockDb.auditLog.create as any).mock.calls[0][0].data;
    expect(auditCall.action).toBe("legacy_public_object_import");
    expect(auditCall.actorId).toBe("test-run-001");
    expect(auditCall.resource).toBe(VALID_OBJECT_KEY);
  });

  it("repairs existing object when location is missing", async () => {
    // Simulate existing object but no primary active location
    mockDb.object.findUnique = vi.fn().mockResolvedValue({
      id: "existing-obj",
      objectKey: VALID_OBJECT_KEY,
      objectProfile: "legacy_public_delivery",
    });
    mockDb.objectStorageLocation.findFirst = vi.fn().mockResolvedValue(null);
    mockDb.objectStorageLocation.create = vi.fn().mockResolvedValue({ id: "new-loc" });

    const lines: ImportLine[] = [{ url: `https://dl.infinex.cn/${VALID_OBJECT_KEY}` }];
    const result = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);

    expect(result.scanned).toBe(1);
    expect(result.repaired).toBe(1);
    expect(mockDb.object.create).not.toHaveBeenCalled(); // didn't create new object
    expect(mockDb.objectStorageLocation.create).toHaveBeenCalledTimes(1);
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it("skips unchanged when object and location already exist", async () => {
    mockDb.object.findUnique = vi.fn().mockResolvedValue({
      id: "existing-obj",
      objectKey: VALID_OBJECT_KEY,
      objectProfile: "legacy_public_delivery",
    });
    mockDb.objectStorageLocation.findFirst = vi.fn().mockResolvedValue({
      id: "existing-loc",
      objectId: "existing-obj",
      locationRole: "primary",
      status: "active",
    });

    const lines: ImportLine[] = [{ url: `https://dl.infinex.cn/${VALID_OBJECT_KEY}` }];
    const result = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);

    expect(result.scanned).toBe(1);
    expect(result.unchanged).toBe(1);
    expect(mockDb.object.create).not.toHaveBeenCalled();
    expect(mockDb.objectStorageLocation.create).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it("is idempotent on repeated calls with same input", async () => {
    // First call: create
    mockDb.object.findUnique = vi.fn().mockResolvedValue(null);
    const lines: ImportLine[] = [{ url: `https://dl.infinex.cn/${VALID_OBJECT_KEY}` }];
    const result1 = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);
    expect(result1.created).toBe(1);

    // Second call: existing object, missing location
    vi.clearAllMocks();
    mockDb.object.findUnique = vi.fn().mockResolvedValue({
      id: "existing-obj",
      objectKey: VALID_OBJECT_KEY,
    });
    mockDb.objectStorageLocation.findFirst = vi.fn().mockResolvedValue(null);

    const result2 = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);
    expect(result2.repaired).toBe(1);

    // Third call: already imported
    vi.clearAllMocks();
    mockDb.object.findUnique = vi.fn().mockResolvedValue({
      id: "existing-obj",
      objectKey: VALID_OBJECT_KEY,
    });
    mockDb.objectStorageLocation.findFirst = vi.fn().mockResolvedValue({
      id: "existing-loc",
      objectId: "existing-obj",
      locationRole: "primary",
      status: "active",
    });

    const result3 = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);
    expect(result3.unchanged).toBe(1);
  });

  it("processes multiple valid lines", async () => {
    const lines: ImportLine[] = [
      { url: `https://dl.infinex.cn/laicai/prd/post/attachment/1/image/2026/04/a.jpg` },
      { url: `https://dl.infinex.cn/laicai/prd/member/avatar/2/image/2026/04/b.jpg` },
      { objectKey: "laicai/prod/post/attachment/3/image/2026/04/c.jpg" },
    ];
    const result = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);

    expect(result.scanned).toBe(3);
    expect(result.created).toBe(3);
    expect(mockDb.object.create).toHaveBeenCalledTimes(3);
    expect(mockDb.objectStorageLocation.create).toHaveBeenCalledTimes(3);
    expect(mockDb.auditLog.create).toHaveBeenCalledTimes(3);
  });

  it("uses direct objectKey when provided without url", async () => {
    const lines: ImportLine[] = [{ objectKey: VALID_OBJECT_KEY }];
    const result = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);

    expect(result.scanned).toBe(1);
    expect(result.created).toBe(1);
    const createCall = (mockDb.object.create as any).mock.calls[0][0].data;
    expect(createCall.objectKey).toBe(VALID_OBJECT_KEY);
  });

  it("reports binding resolution failures as errors", async () => {
    mockDeps.resolver.resolve = vi.fn().mockRejectedValue(new Error("project not registered"));

    const lines: ImportLine[] = [{ url: `https://dl.infinex.cn/${VALID_OBJECT_KEY}` }];
    const result = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);

    expect(result.scanned).toBe(1);
    expect(result.errors[0].error).toContain("project not registered");
  });

  it("reports headObject failure as errors", async () => {
    const adapter = {
      headObject: vi.fn().mockRejectedValue(new Error("connection timeout")),
    };
    mockDeps.factory.getOrCreate = vi.fn().mockReturnValue(adapter);

    const lines: ImportLine[] = [{ url: `https://dl.infinex.cn/${VALID_OBJECT_KEY}` }];
    const result = await importLegacyPublicObjectsFromLines(lines, mockDb, mockDeps, DEFAULT_OPTIONS);

    expect(result.scanned).toBe(1);
    expect(result.errors[0].error).toContain("connection timeout");
  });
});

// ---------------------------------------------------------------------------
// rollbackLegacyPublicImport
// ---------------------------------------------------------------------------

describe("rollbackLegacyPublicImport", () => {
  let mockDb: DbClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDb = makeMockDb();
  });

  it("dry-run: does not modify DB", async () => {
    mockDb.object.findMany = vi.fn().mockResolvedValue([
      { id: "obj-1", objectKey: VALID_OBJECT_KEY, objectProfile: "legacy_public_delivery" },
    ]);

    const result = await rollbackLegacyPublicImport(
      mockDb,
      { now: () => new Date("2026-04-01T12:00:00.000Z") },
      { dryRun: true, runId: "test-run-001" },
    );

    expect(result.dryRun).toBe(true);
    expect(result.affected).toBe(1);
    expect(mockDb.object.update).not.toHaveBeenCalled();
    expect(mockDb.objectStorageLocation.update).not.toHaveBeenCalled();
    expect(mockDb.auditLog.create).not.toHaveBeenCalled();
  });

  it("marks objects as deleted and deactivates locations", async () => {
    mockDb.object.findMany = vi.fn().mockResolvedValue([
      {
        id: "obj-1",
        objectKey: VALID_OBJECT_KEY,
        objectProfile: "legacy_public_delivery",
        purpose: "legacy_public_delivery_import:test-run-001",
      },
    ]);
    mockDb.objectStorageLocation.findMany = vi.fn().mockResolvedValue([
      { id: "loc-1", objectId: "obj-1", status: "active" },
      { id: "loc-2", objectId: "obj-1", status: "active" },
    ]);
    mockDb.object.update = vi.fn().mockResolvedValue(undefined);
    mockDb.objectStorageLocation.update = vi.fn().mockResolvedValue(undefined);

    const result = await rollbackLegacyPublicImport(
      mockDb,
      { now: () => new Date("2026-04-01T12:00:00.000Z") },
      { dryRun: false, runId: "test-run-001" },
    );

    expect(result.affected).toBe(1);
    expect(result.objectsDeactivated).toBe(1);
    expect(result.locationsDeactivated).toBe(2);
    expect(result.auditLogsWritten).toBe(1);

    // Object was marked as deleted
    expect(mockDb.object.update).toHaveBeenCalledWith({
      where: { id: "obj-1" },
      data: { status: "deleted", deletedAt: expect.any(Date) },
    });

    // Both locations deactivated
    expect(mockDb.objectStorageLocation.update).toHaveBeenCalledTimes(2);

    // Audit log created
    expect(mockDb.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "legacy_public_object_rollback" }),
    });
  });

  it("only affects objects matching profile+purpose and not already deleted", async () => {
    mockDb.object.findMany = vi.fn().mockResolvedValue([]);

    const result = await rollbackLegacyPublicImport(
      mockDb,
      { now: () => new Date() },
      { dryRun: false, runId: "test-run-001" },
    );

    expect(result.affected).toBe(0);
    expect(mockDb.object.findMany).toHaveBeenCalledWith({
      where: {
        objectProfile: "legacy_public_delivery",
        purpose: "legacy_public_delivery_import:test-run-001",
        status: { not: "deleted" },
      },
    });
  });
});
