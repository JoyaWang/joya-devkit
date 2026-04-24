import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  object: {
    findUnique: vi.fn(),
  },
  appRelease: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  },
  releaseChannel: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
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

async function captureRoutes(register: (app: any) => Promise<void>) {
  const handlers = new Map<string, any>();
  const app = {
    post: vi.fn((path: string, fn: any) => {
      handlers.set(`POST ${path}`, fn);
    }),
    get: vi.fn((path: string, fn: any) => {
      handlers.set(`GET ${path}`, fn);
    }),
    patch: vi.fn((path: string, fn: any) => {
      handlers.set(`PATCH ${path}`, fn);
    }),
    delete: vi.fn((path: string, fn: any) => {
      handlers.set(`DELETE ${path}`, fn);
    }),
  };

  await register(app);
  return handlers;
}

function makeRelease(overrides: Record<string, any> = {}) {
  return {
    id: "release-001",
    projectKey: "laicai",
    platform: "android",
    env: "prod",
    channel: "official",
    appVersion: "1.0.2",
    buildNumber: 18,
    semanticVersion: "1.0.2+18",
    distributionTarget: "direct",
    distributionUrl: "https://dl.infinex.cn/laicai/prod/release.apk",
    artifactObjectKey: null,
    releaseNotes: "修复版本链路",
    changelog: null,
    forceUpdate: false,
    minSupportedVersion: "1.0.2+16",
    rolloutStatus: "active",
    rolloutPercent: 100,
    createdBy: "laicai",
    createdAt: new Date("2026-04-19T09:00:00Z"),
    ...overrides,
  };
}

describe("Release Service channel control", () => {
  let handlers: Map<string, any>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.object.findUnique.mockResolvedValue(null);
    mockPrisma.appRelease.findMany.mockResolvedValue([]);
    mockPrisma.appRelease.count.mockResolvedValue(0);
    mockPrisma.appRelease.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.appRelease.update.mockImplementation(async ({ where, data }: any) =>
      makeRelease({
        id: where.id,
        ...data,
      }),
    );
    mockPrisma.appRelease.delete.mockResolvedValue(undefined);
    mockPrisma.releaseChannel.findMany.mockResolvedValue([]);
    mockPrisma.releaseChannel.upsert.mockResolvedValue(undefined);
    mockPrisma.releaseChannel.update.mockResolvedValue(undefined);
    mockPrisma.auditLog.create.mockResolvedValue(undefined);
    handlers = await captureRoutes(registerReleasesRoutes);
  });

  it("uses release channel activeReleaseId as latest truth source", async () => {
    const latestHandler = handlers.get("GET /v1/releases/latest");
    const activeRelease = makeRelease({ id: "release-active" });

    mockPrisma.releaseChannel.findUnique.mockResolvedValue({
      id: "channel-001",
      projectKey: "laicai",
      platform: "android",
      env: "prod",
      channel: "official",
      activeReleaseId: "release-active",
    });
    mockPrisma.appRelease.findUnique.mockResolvedValue(activeRelease);

    const reply = makeReply();
    await latestHandler(
      {
        projectKey: "laicai",
        runtimeEnv: "prod",
        query: {
          platform: "android",
          env: "prod",
          channel: "official",
          deviceId: "device-1",
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(reply.payload).toMatchObject({
      id: "release-active",
      env: "prod",
      channel: "official",
      channelActive: true,
    });
    expect(mockPrisma.appRelease.findFirst).not.toHaveBeenCalled();
  });

  it("returns optional update decision for a newer build of the same app version", async () => {
    const checkHandler = handlers.get("GET /v1/releases/check");
    const release = makeRelease({
      id: "release-check",
      appVersion: "1.0.2",
      buildNumber: 18,
      semanticVersion: "1.0.2+18",
      minSupportedVersion: "1.0.2+17",
      rolloutPercent: 100,
    });

    mockPrisma.releaseChannel.findUnique.mockResolvedValue({
      id: "channel-001",
      projectKey: "laicai",
      platform: "android",
      env: "prod",
      channel: "official",
      activeReleaseId: "release-check",
    });
    mockPrisma.appRelease.findUnique.mockResolvedValue(release);

    const reply = makeReply();
    await checkHandler(
      {
        projectKey: "laicai",
        runtimeEnv: "prod",
        query: {
          platform: "android",
          env: "prod",
          channel: "official",
          currentVersion: "1.0.2+17",
          deviceId: "device-1",
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(reply.payload).toMatchObject({
      latestVersion: "1.0.2+18",
      buildNumber: 18,
      hasNewer: true,
      shouldPrompt: true,
      forceUpdate: false,
      updateType: "optional",
    });
  });

  it("activates the target release and pauses the previous active release when rolloutStatus becomes active", async () => {
    const patchHandler = handlers.get("PATCH /v1/releases/:releaseId");
    const existingRelease = makeRelease({
      id: "release-next",
      rolloutStatus: "draft",
    });

    mockPrisma.appRelease.findUnique.mockResolvedValue(existingRelease);
    mockPrisma.releaseChannel.findUnique.mockResolvedValue({
      id: "channel-001",
      projectKey: "laicai",
      platform: "android",
      env: "prod",
      channel: "official",
      activeReleaseId: "release-prev",
    });

    const reply = makeReply();
    await patchHandler(
      {
        projectKey: "laicai",
        runtimeEnv: "prod",
        params: { releaseId: "release-next" },
        body: { rolloutStatus: "active" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(mockPrisma.releaseChannel.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { activeReleaseId: "release-next" },
      }),
    );
    expect(mockPrisma.appRelease.updateMany).toHaveBeenCalledWith({
      where: {
        id: "release-prev",
        projectKey: "laicai",
      },
      data: {
        rolloutStatus: "paused",
      },
    });
    expect(reply.payload).toMatchObject({
      id: "release-next",
      rolloutStatus: "active",
      channelActive: true,
    });
  });

  it("clears the active channel pointer when the active release is paused", async () => {
    const patchHandler = handlers.get("PATCH /v1/releases/:releaseId");
    const existingRelease = makeRelease({
      id: "release-active",
      rolloutStatus: "active",
    });

    mockPrisma.appRelease.findUnique.mockResolvedValue(existingRelease);
    mockPrisma.releaseChannel.findUnique
      .mockResolvedValueOnce({
        id: "channel-001",
        projectKey: "laicai",
        platform: "android",
        env: "prod",
        channel: "official",
        activeReleaseId: "release-active",
      })
      .mockResolvedValueOnce({
        id: "channel-001",
        projectKey: "laicai",
        platform: "android",
        env: "prod",
        channel: "official",
        activeReleaseId: null,
      });

    const reply = makeReply();
    await patchHandler(
      {
        projectKey: "laicai",
        runtimeEnv: "prod",
        params: { releaseId: "release-active" },
        body: { rolloutStatus: "paused" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(mockPrisma.releaseChannel.update).toHaveBeenCalledWith({
      where: {
        projectKey_platform_env_channel: {
          projectKey: "laicai",
          platform: "android",
          env: "prod",
          channel: "official",
        },
      },
      data: { activeReleaseId: null },
    });
    expect(reply.payload).toMatchObject({
      id: "release-active",
      rolloutStatus: "paused",
      channelActive: false,
    });
  });
});
