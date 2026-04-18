/**
 * Route-level tests for runtime environment consistency checks.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemaPath = join(__dirname, "../prisma/schema.prisma");

const mockPrisma = {
  object: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  objectStorageLocation: {
    create: vi.fn(),
    createMany: vi.fn(),
  },
  storageMigrationJob: {
    findFirst: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

vi.mock("../apps/api/src/db.js", () => ({
  getPrisma: () => mockPrisma,
}));

import { registerUploadRequestsRoute } from "../apps/api/src/routes/upload-requests.js";
import { registerDownloadRequestsRoute } from "../apps/api/src/routes/download-requests.js";
import { registerCompleteRoute } from "../apps/api/src/routes/complete.js";
import { registerObjectsDeleteRoute } from "../apps/api/src/routes/objects-delete.js";

const now = new Date();
const devObjectKey = "infov/dev/member/avatar/user_1/profile/2026/04/dev-head.png";
const prdObjectKey = "infov/prd/member/avatar/user_1/profile/2026/04/prd-head.png";

function makeResolver() {
  return {
    resolve: vi.fn().mockResolvedValue({
      manifest: {
        projectKey: "infov",
        displayName: "InfoV",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      binding: {
        projectKey: "infov",
        runtimeEnv: "dev",
        serviceType: "object_storage",
        provider: "cos",
        config: JSON.stringify({ bucket: "infov-dev-bucket", region: "ap-guangzhou", secretId: "id", secretKey: "key" }),
        createdAt: now,
        updatedAt: now,
      },
    }),
  };
}

function makeAdapter() {
  return {
    normalizeObjectKey: vi.fn().mockReturnValue({ objectKey: devObjectKey }),
    createUploadRequest: vi.fn().mockResolvedValue({
      objectKey: devObjectKey,
      uploadUrl: "https://example.com/upload/dev",
      requiredHeaders: {},
      expiresAt: now.toISOString(),
    }),
    createDownloadRequest: vi.fn().mockResolvedValue({
      downloadUrl: "https://example.com/download/dev",
      expiresAt: now.toISOString(),
    }),
    headObject: vi.fn().mockResolvedValue({ exists: true, size: 123, etag: "etag" }),
    deleteObject: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFactory(adapter: ReturnType<typeof makeAdapter>) {
  return {
    getOrCreate: vi.fn().mockReturnValue(adapter),
  };
}

function captureRoute<TDeps>(
  register: (app: any, deps: TDeps) => Promise<void>,
  _method: "post" | "delete",
  deps: TDeps,
) {
  let handler: any;
  const app: any = {
    post: vi.fn((_: string, fn: any) => {
      handler = fn;
      return app;
    }),
    delete: vi.fn((_: string, fn: any) => {
      handler = fn;
      return app;
    }),
  };

  return register(app, deps).then(() => handler);
}

function makeReply() {
  const reply: any = {
    statusCode: 200,
    payload: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    send(payload: unknown) {
      this.payload = payload;
      return payload;
    },
  };
  return reply;
}

describe("object routes runtimeEnv consistency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.object.create.mockResolvedValue(undefined);
    mockPrisma.object.findUnique.mockResolvedValue(null);
    mockPrisma.object.update.mockResolvedValue(undefined);
    mockPrisma.objectStorageLocation.create.mockResolvedValue(undefined);
    mockPrisma.objectStorageLocation.createMany.mockResolvedValue({ count: 0 });
    mockPrisma.storageMigrationJob.findFirst.mockResolvedValue(null);
    mockPrisma.auditLog.create.mockResolvedValue(undefined);
  });

  it("uses authenticated runtimeEnv when resolving upload binding", async () => {
    const resolver = makeResolver();
    const adapter = makeAdapter();
    const factory = makeFactory(adapter);
    const handler = await captureRoute(registerUploadRequestsRoute, "post", { resolver, factory } as any);
    const reply = makeReply();

    await handler(
      {
        projectKey: "infov",
        runtimeEnv: "dev",
        body: {
          project: "infov",
          env: "dev",
          domain: "member",
          scope: "avatar",
          entityId: "user_1",
          fileKind: "profile",
          fileName: "head.png",
          contentType: "image/png",
          size: 123,
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(201);
    expect(resolver.resolve).toHaveBeenCalledWith("infov", "dev", "object_storage");
    expect(adapter.normalizeObjectKey).toHaveBeenCalledWith(expect.objectContaining({ env: "dev" }));
  });

  it("rejects upload when body.env does not match authenticated runtimeEnv", async () => {
    const resolver = makeResolver();
    const adapter = makeAdapter();
    const factory = makeFactory(adapter);
    const handler = await captureRoute(registerUploadRequestsRoute, "post", { resolver, factory } as any);
    const reply = makeReply();

    await handler(
      {
        projectKey: "infov",
        runtimeEnv: "dev",
        body: {
          project: "infov",
          env: "prd",
          domain: "member",
          scope: "avatar",
          entityId: "user_1",
          fileKind: "profile",
          fileName: "head.png",
          contentType: "image/png",
          size: 123,
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(403);
    expect(reply.payload.error).toBe("env_mismatch");
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  it("rejects download when objectKey env does not match authenticated runtimeEnv", async () => {
    const resolver = makeResolver();
    const adapter = makeAdapter();
    const factory = makeFactory(adapter);
    mockPrisma.object.findUnique.mockResolvedValue({
      objectKey: prdObjectKey,
      projectKey: "infov",
      env: "prd",
      fileName: "head.png",
      status: "active",
    });
    const handler = await captureRoute(registerDownloadRequestsRoute, "post", { resolver, factory } as any);
    const reply = makeReply();

    await handler(
      {
        projectKey: "infov",
        runtimeEnv: "dev",
        body: { objectKey: prdObjectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(403);
    expect(reply.payload.error).toBe("env_mismatch");
    expect(adapter.createDownloadRequest).not.toHaveBeenCalled();
  });

  it("rejects complete when objectKey env does not match authenticated runtimeEnv", async () => {
    const resolver = makeResolver();
    const adapter = makeAdapter();
    const factory = makeFactory(adapter);
    mockPrisma.object.findUnique.mockResolvedValue({
      objectKey: prdObjectKey,
      projectKey: "infov",
      env: "prd",
      fileName: "head.png",
      status: "pending_upload",
    });
    const handler = await captureRoute(registerCompleteRoute, "post", { resolver, factory } as any);
    const reply = makeReply();

    await handler(
      {
        projectKey: "infov",
        runtimeEnv: "dev",
        body: { objectKey: prdObjectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(403);
    expect(reply.payload.error).toBe("env_mismatch");
    expect(adapter.headObject).not.toHaveBeenCalled();
  });

  it("rejects delete when objectKey env does not match authenticated runtimeEnv", async () => {
    const resolver = makeResolver();
    const adapter = makeAdapter();
    const factory = makeFactory(adapter);
    mockPrisma.object.findUnique.mockResolvedValue({
      objectKey: prdObjectKey,
      projectKey: "infov",
      env: "prd",
      fileName: "head.png",
      status: "active",
    });
    const handler = await captureRoute(registerObjectsDeleteRoute, "delete", { resolver, factory } as any);
    const reply = makeReply();

    await handler(
      {
        projectKey: "infov",
        runtimeEnv: "dev",
        body: { objectKey: prdObjectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(403);
    expect(reply.payload.error).toBe("env_mismatch");
    expect(adapter.deleteObject).not.toHaveBeenCalled();
  });

  it("defines migration truth-source models in prisma schema", () => {
    const schema = readFileSync(schemaPath, "utf8");

    expect(schema).toContain("model ObjectStorageLocation {");
    expect(schema).toContain("@@map(\"object_storage_locations\")");
    expect(schema).toMatch(/locationRole\s+String\s+@map\("location_role"\)/);
    expect(schema).toMatch(/provider\s+String/);
    expect(schema).toMatch(/bindingId\s+String\s+@map\("binding_id"\)/);
    expect(schema).toMatch(/status\s+String\s+@default\("active"\)/);
    expect(schema).toContain("model StorageMigrationJob {");
    expect(schema).toContain("@@map(\"storage_migration_jobs\")");
    expect(schema).toMatch(/sourceBindingId\s+String\s+@map\("source_binding_id"\)/);
    expect(schema).toMatch(/targetBindingId\s+String\s+@map\("target_binding_id"\)/);
    expect(schema).toMatch(/selector\s+String\?/);
    expect(schema).toMatch(/detail\s+String\?/);
  });

  it("writes primary storage location after complete succeeds", async () => {
    const resolver = makeResolver();
    const adapter = makeAdapter();
    const factory = makeFactory(adapter);
    const objectId = "obj_123";
    const bindingId = "binding_dev_cos";

    resolver.resolve.mockResolvedValue({
      manifest: {
        projectKey: "infov",
        displayName: "InfoV",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      binding: {
        id: bindingId,
        projectKey: "infov",
        runtimeEnv: "dev",
        serviceType: "object_storage",
        provider: "cos",
        config: JSON.stringify({ bucket: "infov-dev-bucket", region: "ap-guangzhou", secretId: "id", secretKey: "key" }),
        createdAt: now,
        updatedAt: now,
      },
    });
    mockPrisma.object.findUnique.mockResolvedValue({
      id: objectId,
      objectKey: devObjectKey,
      projectKey: "infov",
      env: "dev",
      fileName: "head.png",
      status: "pending_upload",
    });
    const handler = await captureRoute(registerCompleteRoute, "post", { resolver, factory } as any);
    const reply = makeReply();

    await handler(
      {
        projectKey: "infov",
        runtimeEnv: "dev",
        body: { objectKey: devObjectKey, size: 123, checksum: "sha256:abc" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(mockPrisma.object.update).toHaveBeenCalledWith({
      where: { objectKey: devObjectKey },
      data: {
        status: "active",
        size: 123,
        checksum: "sha256:abc",
      },
    });
    expect(mockPrisma.objectStorageLocation.create).toHaveBeenCalledWith({
      data: {
        objectId,
        bindingId,
        provider: "cos",
        locationRole: "primary",
        status: "active",
      },
    });
  });

  it("writes pending replica location when active dual-write migration exists", async () => {
    const resolver = makeResolver();
    const adapter = makeAdapter();
    const factory = makeFactory(adapter);
    const objectId = "obj_dual_write";
    const sourceBindingId = "binding_dev_cos";
    const targetBindingId = "binding_target_cos";

    resolver.resolve.mockResolvedValue({
      manifest: {
        projectKey: "infov",
        displayName: "InfoV",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      binding: {
        id: sourceBindingId,
        projectKey: "infov",
        runtimeEnv: "dev",
        serviceType: "object_storage",
        provider: "cos",
        config: JSON.stringify({ bucket: "infov-dev-bucket", region: "ap-guangzhou", secretId: "id", secretKey: "key" }),
        createdAt: now,
        updatedAt: now,
      },
    });
    mockPrisma.object.findUnique.mockResolvedValue({
      id: objectId,
      objectKey: devObjectKey,
      projectKey: "infov",
      env: "dev",
      fileName: "head.png",
      status: "pending_upload",
    });
    mockPrisma.storageMigrationJob.findFirst.mockResolvedValue({
      id: "job_dual_write",
      projectKey: "infov",
      runtimeEnv: "dev",
      serviceType: "object_storage",
      sourceBindingId,
      targetBindingId,
      status: "dual_write",
      createdAt: now,
    });

    const handler = await captureRoute(registerCompleteRoute, "post", { resolver, factory } as any);
    const reply = makeReply();

    await handler(
      {
        projectKey: "infov",
        runtimeEnv: "dev",
        body: { objectKey: devObjectKey, size: 123, checksum: "sha256:abc" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(mockPrisma.storageMigrationJob.findFirst).toHaveBeenCalledWith({
      where: {
        projectKey: "infov",
        runtimeEnv: "dev",
        serviceType: "object_storage",
        status: "dual_write",
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    expect(mockPrisma.objectStorageLocation.createMany).toHaveBeenCalledWith({
      data: [
        {
          objectId,
          bindingId: targetBindingId,
          provider: "cos",
          locationRole: "replica",
          status: "pending_backfill",
        },
      ],
      skipDuplicates: true,
    });
  });
});
