/**
 * Tests for shared public delivery entrypoint.
 *
 * Contract:
 * - Only requests coming from dl-dev.infinex.cn / dl.infinex.cn should hit this route
 * - Only active + public-stable objects can be delivered from this shared entrypoint
 * - The route resolves project binding via object.projectKey + object.env
 * - The route redirects to provider download URL, so stable public host is decoupled from provider host
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

vi.mock("@srs/object-service", async () => {
  const actual = await vi.importActual<any>("../packages/object-service/src/index.ts");
  return actual;
});

import { registerPublicDeliveryRoute } from "../apps/api/src/routes/public-delivery.js";

function makeReply() {
  const reply: any = {
    statusCode: 200,
    payload: undefined,
    headers: {} as Record<string, string>,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    code(code: number) {
      this.statusCode = code;
      return this;
    },
    header(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    redirect(url: string) {
      this.statusCode = this.statusCode || 302;
      this.headers.location = url;
      return { redirectedTo: url };
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
    get: vi.fn((_: string, optionsOrHandler: any, maybeHandler?: any) => {
      handler = typeof optionsOrHandler === "function" ? optionsOrHandler : maybeHandler;
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
    objectKey: "infov/dev/release/android/1.0.0+100/apk/2026/04/uuid-app-release.apk",
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

describe("shared public delivery entrypoint", () => {
  let handler: (req: any, reply: any) => any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.objectStorageLocation.findFirst.mockResolvedValue(null);
    mockPrisma.objectStorageLocation.findMany.mockResolvedValue([]);
    mockPrisma.projectServiceBinding.findUnique.mockResolvedValue(null);
    mockFactory.getOrCreate.mockImplementation(() => mockAdapter as any);
    mockAdapter.headObject.mockResolvedValue({ exists: true });
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
    mockAdapter.createDownloadRequest.mockResolvedValue({
      downloadUrl: "https://cos.example.com/real-download-url",
      expiresAt: "2026-04-10T02:00:00.000Z",
    });
    handler = await captureRoute(registerPublicDeliveryRoute, {
      resolver: mockResolver,
      factory: mockFactory,
    });
  });

  it("redirects using primary storage location binding when location exists", async () => {
    const objectKey = "infov/dev/release/android/1.0.0+100/apk/2026/04/uuid-app-release.apk";
    const historicalBinding = {
      id: "binding-old-public",
      projectKey: "infov",
      runtimeEnv: "dev",
      serviceType: "object_storage",
      provider: "cos",
      config: "{\"bucket\":\"historical-public\"}",
    };
    const historicalAdapter = {
      headObject: vi.fn().mockResolvedValue({ exists: true }),
      createDownloadRequest: vi.fn().mockResolvedValue({
        downloadUrl: "https://cos.example.com/historical-public-url",
        expiresAt: "2026-04-10T02:00:00.000Z",
      }),
    };
    mockPrisma.object.findUnique.mockResolvedValue(
      makeObjectRecord({ id: "obj-public-location", objectKey, accessClass: "public-stable", env: "dev" })
    );
    mockPrisma.objectStorageLocation.findFirst.mockResolvedValue({
      id: "location-public-primary",
      objectId: "obj-public-location",
      bindingId: "binding-old-public",
      provider: "cos",
      locationRole: "primary",
      status: "active",
    });
    mockPrisma.projectServiceBinding.findUnique.mockResolvedValue(historicalBinding);
    mockFactory.getOrCreate.mockReturnValueOnce(historicalAdapter as any);

    const reply = makeReply();
    await handler(
      {
        hostname: "dl-dev.infinex.cn",
        params: { "*": objectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(302);
    expect(reply.headers.location).toBe("https://cos.example.com/historical-public-url");
    expect(mockPrisma.objectStorageLocation.findFirst).toHaveBeenCalledWith({
      where: {
        objectId: "obj-public-location",
        locationRole: "primary",
        status: "active",
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    expect(mockPrisma.projectServiceBinding.findUnique).toHaveBeenCalledWith({
      where: { id: "binding-old-public" },
    });
    expect(mockResolver.resolve).toHaveBeenCalledWith("infov", "dev", "object_storage");
    expect(historicalAdapter.createDownloadRequest).toHaveBeenCalledWith({ objectKey });
    expect(mockAdapter.headObject).not.toHaveBeenCalled();
    expect(mockAdapter.createDownloadRequest).not.toHaveBeenCalled();
  });

  it("falls back to current resolver binding when no storage location exists", async () => {
    const objectKey = "infov/dev/release/android/1.0.0+100/apk/2026/04/uuid-app-release.apk";
    mockPrisma.object.findUnique.mockResolvedValue(
      makeObjectRecord({ objectKey, accessClass: "public-stable", env: "dev" })
    );

    const reply = makeReply();
    await handler(
      {
        hostname: "dl-dev.infinex.cn",
        params: { "*": objectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(302);
    expect(reply.headers.location).toBe("https://cos.example.com/real-download-url");
    expect(mockResolver.resolve).toHaveBeenCalledWith("infov", "dev", "object_storage");
    expect(mockAdapter.createDownloadRequest).toHaveBeenCalledWith({ objectKey });
  });

  it("uses active replica location before resolver binding when primary public binding object is missing", async () => {
    const objectKey = "infov/dev/release/android/1.0.0+100/apk/2026/04/uuid-app-release.apk";
    const primaryBinding = {
      id: "binding-old-public",
      projectKey: "infov",
      runtimeEnv: "dev",
      serviceType: "object_storage",
      provider: "cos",
      config: "{\"bucket\":\"historical-public\"}",
    };
    const replicaBinding = {
      id: "binding-replica-public",
      projectKey: "infov",
      runtimeEnv: "dev",
      serviceType: "object_storage",
      provider: "cos",
      config: "{\"bucket\":\"replica-public\"}",
    };
    const primaryAdapter = {
      headObject: vi.fn().mockResolvedValue({ exists: false }),
      createDownloadRequest: vi.fn(),
    };
    const replicaAdapter = {
      headObject: vi.fn().mockResolvedValue({ exists: true }),
      createDownloadRequest: vi.fn().mockResolvedValue({
        downloadUrl: "https://cos.example.com/replica-public-url",
        expiresAt: "2026-04-10T02:00:00.000Z",
      }),
    };
    mockPrisma.object.findUnique.mockResolvedValue(
      makeObjectRecord({ id: "obj-public-fallback", objectKey, accessClass: "public-stable", env: "dev" })
    );
    mockPrisma.objectStorageLocation.findFirst.mockResolvedValue({
      id: "location-public-primary",
      objectId: "obj-public-fallback",
      bindingId: "binding-old-public",
      provider: "cos",
      locationRole: "primary",
      status: "active",
    });
    mockPrisma.objectStorageLocation.findMany.mockResolvedValue([
      {
        id: "location-public-replica",
        objectId: "obj-public-fallback",
        bindingId: "binding-replica-public",
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
        hostname: "dl-dev.infinex.cn",
        params: { "*": objectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(302);
    expect(reply.headers.location).toBe("https://cos.example.com/replica-public-url");
    expect(mockPrisma.objectStorageLocation.findMany).toHaveBeenCalledWith({
      where: {
        objectId: "obj-public-fallback",
        status: "active",
        locationRole: { in: ["replica", "fallback"] },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
    expect(mockPrisma.projectServiceBinding.findUnique).toHaveBeenNthCalledWith(2, {
      where: { id: "binding-replica-public" },
    });
    expect(primaryAdapter.headObject).toHaveBeenCalledWith({ objectKey });
    expect(primaryAdapter.createDownloadRequest).not.toHaveBeenCalled();
    expect(replicaAdapter.headObject).toHaveBeenCalledWith({ objectKey });
    expect(replicaAdapter.createDownloadRequest).toHaveBeenCalledWith({ objectKey });
    expect(mockResolver.resolve).toHaveBeenCalledWith("infov", "dev", "object_storage");
    expect(mockAdapter.headObject).not.toHaveBeenCalled();
    expect(mockAdapter.createDownloadRequest).not.toHaveBeenCalled();
  });

  it("returns 404 when public object is missing in all candidate bindings", async () => {
    const objectKey = "infov/dev/release/android/1.0.0+100/apk/2026/04/uuid-app-release.apk";
    const historicalBinding = {
      id: "binding-old-public",
      projectKey: "infov",
      runtimeEnv: "dev",
      serviceType: "object_storage",
      provider: "cos",
      config: "{\"bucket\":\"historical-public\"}",
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
      makeObjectRecord({ id: "obj-public-missing", objectKey, accessClass: "public-stable", env: "dev" })
    );
    mockPrisma.objectStorageLocation.findFirst.mockResolvedValue({
      id: "location-public-primary",
      objectId: "obj-public-missing",
      bindingId: "binding-old-public",
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
        hostname: "dl-dev.infinex.cn",
        params: { "*": objectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(404);
    expect(reply.payload).toMatchObject({
      error: "object not found",
      debug: { objectKey: "infov/dev/release/android/1.0.0+100/apk/2026/04/uuid-app-release.apk" },
    });
    expect(historicalAdapter.headObject).toHaveBeenCalledWith({ objectKey });
    expect(currentAdapter.headObject).toHaveBeenCalledWith({ objectKey });
    expect(historicalAdapter.createDownloadRequest).not.toHaveBeenCalled();
    expect(currentAdapter.createDownloadRequest).not.toHaveBeenCalled();
  });

  it("redirects active public-stable object from prod host", async () => {
    const objectKey = "infov/prod/release/android/1.0.0+100/apk/2026/04/uuid-app-release.apk";
    mockPrisma.object.findUnique.mockResolvedValue(
      makeObjectRecord({ objectKey, accessClass: "public-stable", env: "prod" })
    );

    const reply = makeReply();
    await handler(
      {
        hostname: "dl.infinex.cn",
        params: { "*": objectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(302);
    expect(mockResolver.resolve).toHaveBeenCalledWith("infov", "prod", "object_storage");
  });

  it("redirects active public-stable object from legacy prd env in database (backward compat)", async () => {
    const objectKey = "infov/prd/release/android/1.0.0+100/apk/2026/04/uuid-app-release.apk";
    mockPrisma.object.findUnique.mockResolvedValue(
      makeObjectRecord({ objectKey, accessClass: "public-stable", env: "prd" })
    );

    const reply = makeReply();
    await handler(
      {
        hostname: "dl.infinex.cn",
        params: { "*": objectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(302);
    expect(mockResolver.resolve).toHaveBeenCalledWith("infov", "prd", "object_storage");
  });

  it("accepts accelerated host header from CDN origin request", async () => {
    const objectKey = "infov/dev/release/android/1.0.0+100/apk/2026/04/uuid-app-release.apk";
    mockPrisma.object.findUnique.mockResolvedValue(
      makeObjectRecord({ objectKey, accessClass: "public-stable", env: "dev" })
    );

    const reply = makeReply();
    await handler(
      {
        hostname: "laicai-storage-dev-1321178972.cos.ap-shanghai.myqcloud.com",
        headers: {
          "tencent-acceleration-domain-name": "dl-dev.infinex.cn",
          host: "laicai-storage-dev-1321178972.cos.ap-shanghai.myqcloud.com",
        },
        params: { "*": objectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(302);
    expect(reply.headers.location).toBe("https://cos.example.com/real-download-url");
    expect(mockResolver.resolve).toHaveBeenCalledWith("infov", "dev", "object_storage");
  });

  it("rejects when object is not found", async () => {
    mockPrisma.object.findUnique.mockResolvedValue(null);

    const reply = makeReply();
    await handler(
      {
        hostname: "dl-dev.infinex.cn",
        params: { "*": "infov/dev/release/android/1.0.0+100/apk/2026/04/missing.apk" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(404);
    expect(mockAdapter.createDownloadRequest).not.toHaveBeenCalled();
  });

  it("rejects when object is not public-stable", async () => {
    const objectKey = "infov/dev/member/avatar/user-123/profile/2026/04/avatar.jpg";
    mockPrisma.object.findUnique.mockResolvedValue(
      makeObjectRecord({ objectKey, accessClass: "private-signed", objectProfile: "private_media" })
    );

    const reply = makeReply();
    await handler(
      {
        hostname: "dl-dev.infinex.cn",
        params: { "*": objectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(403);
    expect(mockAdapter.createDownloadRequest).not.toHaveBeenCalled();
  });

  it("rejects when object is deleted", async () => {
    const objectKey = "infov/dev/release/android/1.0.0+100/apk/2026/04/deleted.apk";
    mockPrisma.object.findUnique.mockResolvedValue(
      makeObjectRecord({ objectKey, status: "deleted" })
    );

    const reply = makeReply();
    await handler(
      {
        hostname: "dl-dev.infinex.cn",
        params: { "*": objectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(410);
    expect(mockAdapter.createDownloadRequest).not.toHaveBeenCalled();
  });

  it("rejects host/env mismatch for non-prod host targeting prod object", async () => {
    const objectKey = "infov/prod/release/android/1.0.0+100/apk/2026/04/uuid-app-release.apk";
    mockPrisma.object.findUnique.mockResolvedValue(
      makeObjectRecord({ objectKey, accessClass: "public-stable", env: "prod" })
    );

    const reply = makeReply();
    await handler(
      {
        hostname: "dl-dev.infinex.cn",
        params: { "*": objectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(403);
    expect(mockAdapter.createDownloadRequest).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Legacy laicai/prd regression
  // -----------------------------------------------------------------------

  it("redirects legacy laicai/prd objectKey with Object.env=prod on dl.infinex.cn without rewriting objectKey", async () => {
    const objectKey = "laicai/prd/post/attachment/2042583502301429760/image/2026/04/751e4fc9-thumb.jpg";
    mockPrisma.object.findUnique.mockResolvedValue(
      makeObjectRecord({ projectKey: "laicai", env: "prod", objectKey, accessClass: "public-stable" })
    );

    const reply = makeReply();
    await handler(
      {
        hostname: "dl.infinex.cn",
        params: { "*": objectKey },
      },
      reply,
    );

    expect(reply.statusCode).toBe(302);
    expect(mockResolver.resolve).toHaveBeenCalledWith("laicai", "prod", "object_storage");
    // Verify the objectKey passed to createDownloadRequest is NOT rewritten
    expect(mockAdapter.createDownloadRequest).toHaveBeenCalledWith({ objectKey });
  });
});
