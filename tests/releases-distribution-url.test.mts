/**
 * Tests for Release Service distributionUrl auto-generation contract.
 *
 * Contract: When CI creates a release without distributionUrl but with artifactObjectKey,
 * SRS auto-generates the URL based on env:
 *   - dev    -> https://dl-dev.infinex.cn/{objectKey}
 *   - staging -> https://dl-dev.infinex.cn/{objectKey}
 *   - prod   -> https://dl.infinex.cn/{objectKey}
 *
 * If CI explicitly provides distributionUrl, SRS preserves it as-is.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
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
    post: vi.fn((_: string, fn: any) => {
      handler = fn;
    }),
    get: vi.fn(),
    patch: vi.fn(),
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
    createdBy: data.createdBy,
    createdAt: new Date("2026-04-09T00:00:00Z"),
  };
}

describe("Release Service distributionUrl auto-generation", () => {
  let handler: (req: any, reply: any) => any;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Dynamic mock: return what was passed to create
    mockPrisma.appRelease.create.mockImplementation(({ data }: any) =>
      Promise.resolve(mockCreateReturn(data))
    );
    mockPrisma.auditLog.create.mockResolvedValue(undefined);
    handler = await captureRoute(registerReleasesRoutes);
  });

  describe("auto-generate distributionUrl from artifactObjectKey", () => {
    it("generates dev URL: https://dl-dev.infinex.cn/{objectKey}", async () => {
      const reply = makeReply();
      const objectKey = "infov/dev/release/android/1.0.0+100/apk/app-release.apk";

      await handler(
        {
          projectKey: "infov",
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
      expect(mockPrisma.appRelease.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          distributionUrl: `https://dl-dev.infinex.cn/${objectKey}`,
          artifactObjectKey: objectKey,
        }),
      });
    });

    it("generates staging URL: https://dl-dev.infinex.cn/{objectKey}", async () => {
      const reply = makeReply();
      const objectKey = "infov/staging/release/android/1.0.0+100/apk/app-release.apk";

      await handler(
        {
          projectKey: "infov",
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

    it("generates prod URL: https://dl.infinex.cn/{objectKey}", async () => {
      const reply = makeReply();
      const objectKey = "infov/prod/release/android/1.0.0+100/apk/app-release.apk";

      await handler(
        {
          projectKey: "infov",
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
      expect(mockPrisma.appRelease.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          distributionUrl: `https://dl.infinex.cn/${objectKey}`,
          artifactObjectKey: objectKey,
        }),
      });
    });
  });

  describe("preserve explicit distributionUrl", () => {
    it("keeps user-provided distributionUrl, does not overwrite with auto-generated value", async () => {
      const reply = makeReply();
      const customUrl = "https://custom.example.com/app.apk";
      const objectKey = "infov/prod/release/android/1.0.0+100/apk/app-release.apk";

      await handler(
        {
          projectKey: "infov",
          body: {
            ...baseReleaseBody,
            env: "prod",
            distributionUrl: customUrl,
            artifactObjectKey: objectKey,
          },
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      expect(reply.payload.distributionUrl).toBe(customUrl);
      expect(mockPrisma.appRelease.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          distributionUrl: customUrl,
          artifactObjectKey: objectKey,
        }),
      });
    });
  });

  describe("edge cases", () => {
    it("sets empty distributionUrl when neither distributionUrl nor artifactObjectKey is provided", async () => {
      const reply = makeReply();

      await handler(
        {
          projectKey: "infov",
          body: {
            ...baseReleaseBody,
            env: "prod",
          },
        },
        reply,
      );

      expect(reply.statusCode).toBe(201);
      expect(reply.payload.distributionUrl).toBe("");
      // artifactObjectKey is stored as null when not provided (see releases.ts line 107)
      expect(mockPrisma.appRelease.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          distributionUrl: "",
          artifactObjectKey: null,
        }),
      });
    });
  });
});
