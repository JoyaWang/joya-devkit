/**
 * Tests for POST /v1/objects/download-requests accessClass routing.
 *
 * Contract:
 * - public-stable objects should return stable public URL via DeliveryPolicyResolver
 * - private-signed / internal-signed objects should continue using adapter.createDownloadRequest()
 * - public-stable objects should NOT go through provider presigned URL simulation
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  object: {
    findUnique: vi.fn(),
  },
  objectStorageLocation: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
  },
  projectServiceBinding: {
    findUnique: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

vi.mock("../apps/api/src/db.js", () => ({
  getPrisma: () => mockPrisma,
}));

const mockAdapter = {
  headObject: vi.fn(),
  createDownloadRequest: vi.fn(),
};

const mockFactory = {
  getOrCreate: vi.fn(() => mockAdapter),
};

const mockResolver = {
  resolve: vi.fn(),
};

const mockDeliveryResolver = {
  resolve: vi.fn(),
};

vi.mock("@srs/project-context", () => ({
  ProjectContextError: class extends Error {
    statusCode: number;
    code: string;
    constructor(message: string, code: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

vi.mock("@srs/object-service", () => ({
  validateObjectKeyFormat: vi.fn(() => ({ valid: true })),
}));

import { registerDownloadRequestsRoute } from "../apps/api/src/routes/download-requests.js";
import { DeliveryPolicyResolver } from "../packages/delivery-policy/src/resolver.js";

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

async function captureRoute(
  register: (app: any, deps: any) => Promise<void>,
  deps: any,
): Promise<(req: any, reply: any) => any> {
  let handler: any;
  const app = {
    post: vi.fn((_: string, fn: any) => {
      handler = fn;
    }),
  };

  await register(app, deps);
  return handler;
}

function makeObjectRecord(overrides: Record<string, any> = {}) {
  return {
    id: "obj-001",
    projectKey: "infov",
    env: "dev",
    domain: "release",
    scope: "android",
    entityId: "1.0.0+100",
    fileKind: "apk",
    objectKey: "infov/dev/release/android/1.0.0+100/apk/app-release.apk",
    fileName: "app-release.apk",
    contentType: "application/vnd.android.package-archive",
    size: 10240000,
    checksum: "abc123",
    visibility: "private",
    objectProfile: "release_artifact",
    accessClass: "public-stable",
    uploaderType: "ci",
    uploaderId: "github-actions",
    status: "active",
    purpose: null,
    createdAt: new Date("2026-04-01T00:00:00Z"),
    deletedAt: null,
    ...overrides,
  };
}

describe("POST /v1/objects/download-requests accessClass routing", () => {
  let handler: (req: any, reply: any) => any;
  const deliveryResolver = new DeliveryPolicyResolver({
    publicStableDomains: {
      dev: "https://dl-dev.infinex.cn",
      staging: "https://dl-dev.infinex.cn",
      prod: "https://dl.infinex.cn",
    },
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.objectStorageLocation.findFirst.mockResolvedValue(null);
    mockPrisma.objectStorageLocation.findMany.mockResolvedValue([]);
    mockPrisma.projectServiceBinding.findUnique.mockResolvedValue(null);
    mockFactory.getOrCreate.mockImplementation(() => mockAdapter as any);
    mockAdapter.headObject.mockResolvedValue({ exists: true });
    mockAdapter.createDownloadRequest.mockResolvedValue({
      downloadUrl: "https://cos.example.com/default-signed-url",
      expiresAt: "2026-04-10T01:00:00.000Z",
    });
    // Setup resolver mock to return project context
    mockResolver.resolve.mockResolvedValue({
      binding: {
        id: "binding-001",
        projectKey: "infov",
        runtimeEnv: "dev",
        serviceType: "object_storage",
        provider: "cos",
        config: "{}",
      },
    });
    mockDeliveryResolver.resolve.mockImplementation((input: any) =>
      deliveryResolver.resolve(input)
    );
    handler = await captureRoute(registerDownloadRequestsRoute, {
      resolver: mockResolver,
      factory: mockFactory,
      deliveryResolver: mockDeliveryResolver,
    });
  });

  describe("public-stable objects", () => {
    it("returns stable public URL via DeliveryPolicyResolver", async () => {
      const objectKey = "infov/dev/release/android/1.0.0+100/apk/app-release.apk";
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({ objectKey, accessClass: "public-stable" })
      );

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: { objectKey },
        },
        reply,
      );

      expect(reply.statusCode).toBe(200);
      expect(reply.payload.downloadUrl).toBe(
        `https://dl-dev.infinex.cn/${objectKey}`
      );
      // Should NOT call adapter for public-stable
      expect(mockAdapter.createDownloadRequest).not.toHaveBeenCalled();
    });

    it("generates prod URL for public-stable object in prod env", async () => {
      const objectKey = "infov/prod/release/android/1.0.0+100/apk/app-release.apk";
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({ objectKey, accessClass: "public-stable", env: "prod" })
      );

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "prod",
          body: { objectKey },
        },
        reply,
      );

      expect(reply.statusCode).toBe(200);
      expect(reply.payload.downloadUrl).toBe(
        `https://dl.infinex.cn/${objectKey}`
      );
      expect(mockAdapter.createDownloadRequest).not.toHaveBeenCalled();
    });
  });

  describe("private-signed objects", () => {
    it("uses primary storage location binding instead of current resolver binding when location exists", async () => {
      const objectKey = "infov/dev/private/user-123/avatar.jpg";
      const historicalBinding = {
        id: "binding-old-primary",
        projectKey: "infov",
        runtimeEnv: "dev",
        serviceType: "object_storage",
        provider: "cos",
        config: "{\"bucket\":\"historical\"}",
      };
      const historicalAdapter = {
        headObject: vi.fn().mockResolvedValue({ exists: true }),
        createDownloadRequest: vi.fn().mockResolvedValue({
          downloadUrl: "https://cos.example.com/historical-signed-url",
          expiresAt: "2026-04-10T01:00:00.000Z",
        }),
      };
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({
          id: "obj-primary-location",
          objectKey,
          accessClass: "private-signed",
          objectProfile: "private_media",
          domain: "private",
          scope: "user-123",
        })
      );
      mockPrisma.objectStorageLocation.findFirst.mockResolvedValue({
        id: "location-primary",
        objectId: "obj-primary-location",
        bindingId: "binding-old-primary",
        provider: "cos",
        locationRole: "primary",
        status: "active",
      });
      mockPrisma.projectServiceBinding.findUnique.mockResolvedValue(historicalBinding);
      mockFactory.getOrCreate.mockReturnValueOnce(historicalAdapter as any);

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: { objectKey },
        },
        reply,
      );

      expect(reply.statusCode).toBe(200);
      expect(reply.payload.downloadUrl).toBe("https://cos.example.com/historical-signed-url");
      expect(mockPrisma.objectStorageLocation.findFirst).toHaveBeenCalledWith({
        where: {
          objectId: "obj-primary-location",
          locationRole: "primary",
          status: "active",
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      expect(mockPrisma.projectServiceBinding.findUnique).toHaveBeenCalledWith({
        where: { id: "binding-old-primary" },
      });
      expect(mockResolver.resolve).toHaveBeenCalledWith("infov", "dev", "object_storage");
      expect(historicalAdapter.createDownloadRequest).toHaveBeenCalledWith({ objectKey });
      expect(mockAdapter.headObject).not.toHaveBeenCalled();
      expect(mockAdapter.createDownloadRequest).not.toHaveBeenCalled();
    });

    it("falls back to current resolver binding when no storage location exists", async () => {
      const objectKey = "infov/dev/private/user-123/avatar.jpg";
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({
          objectKey,
          accessClass: "private-signed",
          objectProfile: "private_media",
          domain: "private",
          scope: "user-123",
        })
      );
      mockAdapter.createDownloadRequest.mockResolvedValue({
        downloadUrl: "https://cos.example.com/signed-url",
        expiresAt: "2026-04-10T01:00:00.000Z",
      });

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: { objectKey },
        },
        reply,
      );

      expect(reply.statusCode).toBe(200);
      expect(reply.payload.downloadUrl).toBe("https://cos.example.com/signed-url");
      expect(mockResolver.resolve).toHaveBeenCalledWith("infov", "dev", "object_storage");
      expect(mockAdapter.createDownloadRequest).toHaveBeenCalledWith({
        objectKey,
      });
    });

    it("uses active replica location before resolver binding when primary binding object is missing", async () => {
      const objectKey = "infov/dev/private/user-123/avatar.jpg";
      const primaryBinding = {
        id: "binding-old-primary",
        projectKey: "infov",
        runtimeEnv: "dev",
        serviceType: "object_storage",
        provider: "cos",
        config: "{\"bucket\":\"historical\"}",
      };
      const replicaBinding = {
        id: "binding-replica",
        projectKey: "infov",
        runtimeEnv: "dev",
        serviceType: "object_storage",
        provider: "cos",
        config: "{\"bucket\":\"replica\"}",
      };
      const primaryAdapter = {
        headObject: vi.fn().mockResolvedValue({ exists: false }),
        createDownloadRequest: vi.fn(),
      };
      const replicaAdapter = {
        headObject: vi.fn().mockResolvedValue({ exists: true }),
        createDownloadRequest: vi.fn().mockResolvedValue({
          downloadUrl: "https://cos.example.com/replica-signed-url",
          expiresAt: "2026-04-10T01:00:00.000Z",
        }),
      };
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({
          id: "obj-fallback-hit",
          objectKey,
          accessClass: "private-signed",
          objectProfile: "private_media",
          domain: "private",
          scope: "user-123",
        })
      );
      mockPrisma.objectStorageLocation.findFirst.mockResolvedValue({
        id: "location-primary",
        objectId: "obj-fallback-hit",
        bindingId: "binding-old-primary",
        provider: "cos",
        locationRole: "primary",
        status: "active",
      });
      mockPrisma.objectStorageLocation.findMany.mockResolvedValue([
        {
          id: "location-replica",
          objectId: "obj-fallback-hit",
          bindingId: "binding-replica",
          provider: "cos",
          locationRole: "replica",
          status: "active",
          createdAt: new Date("2026-04-10T00:00:00.000Z"),
        },
      ]);
      mockPrisma.projectServiceBinding.findUnique
        .mockResolvedValueOnce(primaryBinding)
        .mockResolvedValueOnce(replicaBinding);
      mockFactory.getOrCreate
        .mockReturnValueOnce(primaryAdapter as any)
        .mockReturnValueOnce(replicaAdapter as any);

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: { objectKey },
        },
        reply,
      );

      expect(reply.statusCode).toBe(200);
      expect(reply.payload.downloadUrl).toBe("https://cos.example.com/replica-signed-url");
      expect(mockPrisma.objectStorageLocation.findMany).toHaveBeenCalledWith({
        where: {
          objectId: "obj-fallback-hit",
          status: "active",
          locationRole: { in: ["replica", "fallback"] },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
      expect(mockPrisma.projectServiceBinding.findUnique).toHaveBeenNthCalledWith(2, {
        where: { id: "binding-replica" },
      });
      expect(primaryAdapter.headObject).toHaveBeenCalledWith({ objectKey });
      expect(primaryAdapter.createDownloadRequest).not.toHaveBeenCalled();
      expect(replicaAdapter.headObject).toHaveBeenCalledWith({ objectKey });
      expect(replicaAdapter.createDownloadRequest).toHaveBeenCalledWith({ objectKey });
      expect(mockResolver.resolve).toHaveBeenCalledWith("infov", "dev", "object_storage");
      expect(mockAdapter.headObject).not.toHaveBeenCalled();
      expect(mockAdapter.createDownloadRequest).not.toHaveBeenCalled();
    });

    it("returns 404 when object does not exist in any candidate binding", async () => {
      const objectKey = "infov/dev/private/user-123/avatar.jpg";
      const historicalBinding = {
        id: "binding-old-primary",
        projectKey: "infov",
        runtimeEnv: "dev",
        serviceType: "object_storage",
        provider: "cos",
        config: "{\"bucket\":\"historical\"}",
      };
      const historicalAdapter = {
        headObject: vi.fn().mockResolvedValue({ exists: false }),
        createDownloadRequest: vi.fn(),
      };
      const currentAdapter = {
        headObject: vi.fn().mockResolvedValue({ exists: false }),
        createDownloadRequest: vi.fn(),
      };
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({
          id: "obj-all-missing",
          objectKey,
          accessClass: "private-signed",
          objectProfile: "private_media",
          domain: "private",
          scope: "user-123",
        })
      );
      mockPrisma.objectStorageLocation.findFirst.mockResolvedValue({
        id: "location-primary",
        objectId: "obj-all-missing",
        bindingId: "binding-old-primary",
        provider: "cos",
        locationRole: "primary",
        status: "active",
      });
      mockPrisma.projectServiceBinding.findUnique.mockResolvedValue(historicalBinding);
      mockFactory.getOrCreate
        .mockReturnValueOnce(historicalAdapter as any)
        .mockReturnValueOnce(currentAdapter as any);

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: { objectKey },
        },
        reply,
      );

      expect(reply.statusCode).toBe(404);
      expect(reply.payload).toEqual({ error: "object not found" });
      expect(historicalAdapter.headObject).toHaveBeenCalledWith({ objectKey });
      expect(currentAdapter.headObject).toHaveBeenCalledWith({ objectKey });
      expect(historicalAdapter.createDownloadRequest).not.toHaveBeenCalled();
      expect(currentAdapter.createDownloadRequest).not.toHaveBeenCalled();
    });
  });

  describe("internal-signed objects", () => {
    it("uses adapter.createDownloadRequest() for internal-signed", async () => {
      const objectKey = "infov/dev/internal/logs/app.log";
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({
          objectKey,
          accessClass: "internal-signed",
          objectProfile: "internal_archive",
          domain: "internal",
          scope: "logs",
        })
      );
      mockAdapter.createDownloadRequest.mockResolvedValue({
        downloadUrl: "https://cos.example.com/internal-signed-url",
        expiresAt: "2026-04-10T01:00:00.000Z",
      });

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: { objectKey },
        },
        reply,
      );

      expect(reply.statusCode).toBe(200);
      expect(reply.payload.downloadUrl).toBe("https://cos.example.com/internal-signed-url");
      expect(mockAdapter.createDownloadRequest).toHaveBeenCalledWith({
        objectKey,
      });
    });
  });

  describe("edge cases", () => {
    it("returns 404 when object not found", async () => {
      mockPrisma.object.findUnique.mockResolvedValue(null);

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: { objectKey: "infov/dev/release/android/1.0.0+100/apk/missing.apk" },
        },
        reply,
      );

      expect(reply.statusCode).toBe(404);
      expect(mockAdapter.createDownloadRequest).not.toHaveBeenCalled();
    });

    it("returns 410 when object is deleted", async () => {
      const objectKey = "infov/dev/release/android/1.0.0+100/apk/deleted.apk";
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({ objectKey, status: "deleted" })
      );

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: { objectKey },
        },
        reply,
      );

      expect(reply.statusCode).toBe(410);
      expect(mockAdapter.createDownloadRequest).not.toHaveBeenCalled();
    });

    it("returns 403 when object belongs to different project", async () => {
      const objectKey = "infov/dev/release/android/1.0.0+100/apk/app.apk";
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({ objectKey, projectKey: "other-project" })
      );

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: { objectKey },
        },
        reply,
      );

      expect(reply.statusCode).toBe(403);
      expect(mockAdapter.createDownloadRequest).not.toHaveBeenCalled();
    });
  });
});
