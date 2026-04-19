/**
 * Tests for POST /v1/releases using object metadata as accessClass truth source.
 *
 * Contract:
 * - If artifactObjectKey对应的object记录存在, read object.accessClass for delivery resolution
 * - If object.accessClass is "public-stable", generate public URL
 * - If object.accessClass is "private-signed" or "internal-signed", leave distributionUrl empty
 * - If object not found, fallback to conservative "public-stable" (current behavior)
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  object: {
    findUnique: vi.fn(),
  },
  appRelease: {
    create: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
};

vi.mock("../apps/api/src/db.js", () => ({
  getPrisma: () => mockPrisma,
}));

import { registerReleasesRoutes } from "../apps/api/src/routes/releases.js";

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
  register: (app: any) => Promise<void>,
): Promise<(req: any, reply: any) => any> {
  let handler: any;
  const app = {
    post: vi.fn((path: string, fn: any) => {
      if (path === "/v1/releases") {
        handler = fn;
      }
    }),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  await register(app);
  return handler;
}

const baseReleaseBody = {
  platform: "android",
  appVersion: "1.0.0",
  buildNumber: 100,
  semanticVersion: "1.0.0+100",
  distributionTarget: "direct",
};

function mockCreateReturn(data: any) {
  return {
    id: "release-001",
    projectKey: data.projectKey,
    platform: data.platform,
    env: data.env,
    channel: data.channel,
    appVersion: data.appVersion,
    buildNumber: data.buildNumber,
    semanticVersion: data.semanticVersion,
    distributionTarget: data.distributionTarget,
    distributionUrl: data.distributionUrl,
    artifactObjectKey: data.artifactObjectKey,
    releaseNotes: data.releaseNotes ?? null,
    changelog: data.changelog ?? null,
    forceUpdate: false,
    minSupportedVersion: null,
    rolloutStatus: "draft",
    rolloutPercent: data.rolloutPercent ?? 100,
    createdBy: data.createdBy,
    createdAt: new Date("2026-04-09T00:00:00Z"),
  };
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

describe("POST /v1/releases using object metadata as accessClass truth source", () => {
  let handler: (req: any, reply: any) => any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.appRelease.create.mockImplementation(({ data }: any) =>
      Promise.resolve(mockCreateReturn(data))
    );
    mockPrisma.auditLog.create.mockResolvedValue(undefined);
    handler = await captureRoute(registerReleasesRoutes);
  });

  describe("object exists with public-stable accessClass", () => {
    it("uses object.accessClass to generate public URL", async () => {
      const objectKey = "infov/dev/release/android/1.0.0+100/apk/app-release.apk";
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({ objectKey, accessClass: "public-stable" })
      );

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: {
            ...baseReleaseBody,
            env: "dev",
            artifactObjectKey: objectKey,
          },
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      expect(reply.payload.distributionUrl).toBe(
        `https://dl-dev.infinex.cn/${objectKey}`
      );
      // Verify object was looked up
      expect(mockPrisma.object.findUnique).toHaveBeenCalledWith({
        where: { objectKey },
      });
    });

    it("uses object.accessClass=public-stable for prod env", async () => {
      const objectKey = "infov/prod/release/android/1.0.0+100/apk/app-release.apk";
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({ objectKey, accessClass: "public-stable", env: "prod" })
      );

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "prd",
          body: {
            ...baseReleaseBody,
            env: "prod",
            artifactObjectKey: objectKey,
          },
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      expect(reply.payload.distributionUrl).toBe(
        `https://dl.infinex.cn/${objectKey}`
      );
    });
  });

  describe("object exists with private-signed accessClass", () => {
    it("does not generate public URL, leaves distributionUrl empty", async () => {
      const objectKey = "infov/dev/private/user-123/secret.apk";
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({
          objectKey,
          accessClass: "private-signed",
          objectProfile: "private_media",
        })
      );

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: {
            ...baseReleaseBody,
            env: "dev",
            artifactObjectKey: objectKey,
          },
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      expect(reply.payload.distributionUrl).toBe("");
    });
  });

  describe("object exists with internal-signed accessClass", () => {
    it("does not generate public URL, leaves distributionUrl empty", async () => {
      const objectKey = "infov/dev/internal/logs/archive.zip";
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({
          objectKey,
          accessClass: "internal-signed",
          objectProfile: "internal_archive",
        })
      );

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: {
            ...baseReleaseBody,
            env: "dev",
            artifactObjectKey: objectKey,
          },
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      expect(reply.payload.distributionUrl).toBe("");
    });
  });

  describe("object not found - conservative fallback", () => {
    it("falls back to public-stable when object record not found", async () => {
      const objectKey = "infov/dev/release/android/1.0.0+100/apk/missing.apk";
      mockPrisma.object.findUnique.mockResolvedValue(null);

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: {
            ...baseReleaseBody,
            env: "dev",
            artifactObjectKey: objectKey,
          },
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      // Conservative fallback: assume public-stable
      expect(reply.payload.distributionUrl).toBe(
        `https://dl-dev.infinex.cn/${objectKey}`
      );
    });
  });

  describe("no artifactObjectKey", () => {
    it("sets empty distributionUrl when no artifactObjectKey", async () => {
      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: {
            ...baseReleaseBody,
            env: "dev",
          },
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      expect(reply.payload.distributionUrl).toBe("");
      expect(mockPrisma.object.findUnique).not.toHaveBeenCalled();
    });
  });

  describe("explicit distributionUrl preserved", () => {
    it("preserves explicit distributionUrl even if artifactObjectKey exists", async () => {
      const objectKey = "infov/dev/release/android/1.0.0+100/apk/app-release.apk";
      const customUrl = "https://custom.example.com/app.apk";
      mockPrisma.object.findUnique.mockResolvedValue(
        makeObjectRecord({ objectKey, accessClass: "public-stable" })
      );

      const reply = makeReply();
      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: {
            ...baseReleaseBody,
            env: "dev",
            artifactObjectKey: objectKey,
            distributionUrl: customUrl,
          },
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      // Explicit distributionUrl should be preserved
      expect(reply.payload.distributionUrl).toBe(customUrl);
    });
  });
});
