/**
 * Tests for Release Service using DeliveryPolicyResolver.
 *
 * Contract:
 * - POST /v1/releases should use DeliveryPolicyResolver to generate distributionUrl
 * - Only public-stable objects should get public URLs
 * - Non-public-stable objects should get empty distributionUrl
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

describe("Release Service using DeliveryPolicyResolver", () => {
  let handler: (req: any, reply: any) => any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Default: object not found, use conservative fallback
    mockPrisma.object.findUnique.mockResolvedValue(null);
    mockPrisma.appRelease.create.mockImplementation(({ data }: any) =>
      Promise.resolve(mockCreateReturn(data))
    );
    mockPrisma.auditLog.create.mockResolvedValue(undefined);
    handler = await captureRoute(registerReleasesRoutes);
  });

  describe("public-stable objects (release artifacts)", () => {
    it("generates dev URL for public-stable release artifact", async () => {
      const reply = makeReply();
      const objectKey = "infov/dev/release/android/1.0.0+100/apk/app-release.apk";

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
      expect(reply.payload.distributionUrl).toBe(`https://dl-dev.infinex.cn/${objectKey}`);
    });

    it("generates staging URL for public-stable release artifact", async () => {
      const reply = makeReply();
      const objectKey = "infov/staging/release/android/1.0.0+100/apk/app-release.apk";

      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "staging",
          body: {
            ...baseReleaseBody,
            env: "staging",
            artifactObjectKey: objectKey,
          },
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      expect(reply.payload.distributionUrl).toBe(`https://dl-dev.infinex.cn/${objectKey}`);
    });

    it("generates prod URL for public-stable release artifact", async () => {
      const reply = makeReply();
      const objectKey = "infov/prod/release/android/1.0.0+100/apk/app-release.apk";

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
      expect(reply.payload.distributionUrl).toBe(`https://dl.infinex.cn/${objectKey}`);
    });
  });

  describe("edge cases", () => {
    it("preserves explicit distributionUrl", async () => {
      const reply = makeReply();
      const customUrl = "https://custom.example.com/app.apk";

      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "prd",
          body: {
            ...baseReleaseBody,
            env: "prod",
            distributionUrl: customUrl,
          },
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      expect(reply.payload.distributionUrl).toBe(customUrl);
    });

    it("sets empty distributionUrl when neither distributionUrl nor artifactObjectKey is provided", async () => {
      const reply = makeReply();

      await handler(
        {
          projectKey: "infov",
          runtimeEnv: "prd",
          body: {
            ...baseReleaseBody,
            env: "prod",
          },
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      expect(reply.payload.distributionUrl).toBe("");
    });
  });
});
