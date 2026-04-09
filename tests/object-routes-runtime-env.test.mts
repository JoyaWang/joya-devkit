/**
 * Route-level tests for runtime environment consistency checks.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  object: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
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
  register: (app: { post?: Function; delete?: Function }, deps: TDeps) => Promise<void>,
  method: "post" | "delete",
  deps: TDeps,
) {
  let handler: any;
  const app = {
    post: vi.fn((_: string, fn: any) => {
      handler = fn;
    }),
    delete: vi.fn((_: string, fn: any) => {
      handler = fn;
    }),
  };

  return register(app as any, deps).then(() => handler);
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
    mockPrisma.auditLog.create.mockResolvedValue(undefined);
  });

  it("uses authenticated runtimeEnv when resolving upload binding", async () => {
    const resolver = makeResolver();
    const adapter = makeAdapter();
    const factory = makeFactory(adapter);
    const handler = await captureRoute(registerUploadRequestsRoute, "post", { resolver, factory });
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
    const handler = await captureRoute(registerUploadRequestsRoute, "post", { resolver, factory });
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
    const handler = await captureRoute(registerDownloadRequestsRoute, "post", { resolver, factory });
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
    const handler = await captureRoute(registerCompleteRoute, "post", { resolver, factory });
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
    const handler = await captureRoute(registerObjectsDeleteRoute, "delete", { resolver, factory });
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
});
