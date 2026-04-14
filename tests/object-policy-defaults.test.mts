/**
 * Tests for object policy defaults in upload requests.
 *
 * Contract:
 * - release_artifact objects should default to public-stable access class
 * - member/avatar/profile objects should default to private-signed access class
 * - Default objectProfile should be derived from scope/domain patterns
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAdapter = {
  normalizeObjectKey: vi.fn(({ project, env, domain, scope, entityId, fileKind, fileName }) => ({
    objectKey: `${project}/${env}/${domain}/${scope}/${entityId}/${fileName}`,
  })),
  createUploadRequest: vi.fn().mockResolvedValue({
    objectKey: "test/key",
    uploadUrl: "https://upload.example.com",
    requiredHeaders: {},
    expiresAt: new Date(),
  }),
};

const mockFactory = {
  getOrCreate: vi.fn().mockReturnValue(mockAdapter),
};

const mockResolver = {
  resolve: vi.fn().mockResolvedValue({
    binding: {
      provider: "cos",
      config: "{}",
    },
  }),
};

const mockPrisma = {
  object: {
    create: vi.fn().mockResolvedValue({
      id: "obj-001",
      objectKey: "test/key",
    }),
  },
  auditLog: {
    create: vi.fn().mockResolvedValue(undefined),
  },
};

vi.mock("../apps/api/src/db.js", () => ({
  getPrisma: () => mockPrisma,
}));

import { registerUploadRequestsRoute } from "../apps/api/src/routes/upload-requests.js";

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
): Promise<(req: any, reply: any) => any> {
  let handler: any;
  const app = {
    post: vi.fn((_: string, fn: any) => {
      handler = fn;
    }),
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };

  await register(app, {
    resolver: mockResolver,
    factory: mockFactory,
  });
  return handler;
}

const baseUploadBody = {
  project: "infov",
  env: "dev",
  domain: "android",
  scope: "release",
  entityId: "android-1.0.0",
  fileKind: "apk",
  fileName: "app-release.apk",
  contentType: "application/vnd.android.package-archive",
  size: 1024000,
};

describe("Object policy defaults in upload requests", () => {
  let handler: (req: any, reply: any) => any;

  beforeEach(async () => {
    vi.clearAllMocks();
    handler = await captureRoute(registerUploadRequestsRoute);
  });

  describe("release_artifact objects", () => {
    it("should set default objectProfile to release_artifact for release domain", async () => {
      const reply = makeReply();

      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: baseUploadBody,
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      expect(mockPrisma.object.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          objectProfile: "release_artifact",
        }),
      });
    });
  });

  describe("member/profile objects", () => {
    it("should set default accessClass to private-signed for member domain", async () => {
      const reply = makeReply();

      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "dev",
          body: {
            ...baseUploadBody,
            domain: "member",
            scope: "avatar",
            entityId: "user-123",
            fileName: "avatar.jpg",
            contentType: "image/jpeg",
          },
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      expect(mockPrisma.object.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          accessClass: "private-signed",
          objectProfile: expect.any(String),
        }),
      });
    });
  });
});
