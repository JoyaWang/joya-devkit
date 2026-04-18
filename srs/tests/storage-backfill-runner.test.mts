import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  runPendingBackfillVerification,
  startPendingBackfillVerificationLoop,
} from "../apps/worker/src/backfill-runner.js";

const now = new Date("2026-04-11T06:30:00.000Z");

const mockPrisma = {
  objectStorageLocation: {
    findMany: vi.fn(),
    update: vi.fn(),
  },
  object: {
    findUnique: vi.fn(),
  },
  projectServiceBinding: {
    findUnique: vi.fn(),
  },
};

const targetAdapter = {
  headObject: vi.fn(),
};

const mockFactory = {
  getOrCreate: vi.fn(() => targetAdapter),
};

describe("runPendingBackfillVerification", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    mockPrisma.objectStorageLocation.findMany.mockResolvedValue([]);
    mockPrisma.objectStorageLocation.update.mockResolvedValue(undefined);
    mockPrisma.object.findUnique.mockResolvedValue(null);
    mockPrisma.projectServiceBinding.findUnique.mockResolvedValue(null);
    targetAdapter.headObject.mockResolvedValue({ exists: false });
  });

  it("promotes pending_backfill replica location to active when target binding already has the object", async () => {
    mockPrisma.objectStorageLocation.findMany.mockResolvedValue([
      {
        id: "loc_pending",
        objectId: "obj_1",
        bindingId: "binding_target",
        locationRole: "replica",
        status: "pending_backfill",
      },
    ]);
    mockPrisma.object.findUnique.mockResolvedValue({
      id: "obj_1",
      objectKey: "infov/dev/release/android/1.0.0+100/apk/app.apk",
    });
    mockPrisma.projectServiceBinding.findUnique.mockResolvedValue({
      id: "binding_target",
      projectKey: "infov",
      runtimeEnv: "dev",
      serviceType: "object_storage",
      provider: "cos",
      config: "{}",
      createdAt: now,
      updatedAt: now,
    });
    targetAdapter.headObject.mockResolvedValue({ exists: true });

    const result = await runPendingBackfillVerification({
      prisma: mockPrisma as any,
      factory: mockFactory as any,
      now: () => now,
    });

    expect(result.scanned).toBe(1);
    expect(result.promoted).toBe(1);
    expect(result.stillPending).toBe(0);
    expect(result.skipped).toBe(0);
    expect(mockFactory.getOrCreate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "binding_target" }),
    );
    expect(targetAdapter.headObject).toHaveBeenCalledWith({
      objectKey: "infov/dev/release/android/1.0.0+100/apk/app.apk",
    });
    expect(mockPrisma.objectStorageLocation.update).toHaveBeenCalledWith({
      where: { id: "loc_pending" },
      data: {
        status: "active",
        lastHeadAt: now,
        checksumVerifiedAt: now,
      },
    });
  });

  it("keeps pending_backfill replica location pending when target binding does not have the object yet", async () => {
    mockPrisma.objectStorageLocation.findMany.mockResolvedValue([
      {
        id: "loc_pending",
        objectId: "obj_1",
        bindingId: "binding_target",
        locationRole: "replica",
        status: "pending_backfill",
      },
    ]);
    mockPrisma.object.findUnique.mockResolvedValue({
      id: "obj_1",
      objectKey: "infov/dev/release/android/1.0.0+100/apk/app.apk",
    });
    mockPrisma.projectServiceBinding.findUnique.mockResolvedValue({
      id: "binding_target",
      projectKey: "infov",
      runtimeEnv: "dev",
      serviceType: "object_storage",
      provider: "cos",
      config: "{}",
      createdAt: now,
      updatedAt: now,
    });
    targetAdapter.headObject.mockResolvedValue({ exists: false });

    const result = await runPendingBackfillVerification({
      prisma: mockPrisma as any,
      factory: mockFactory as any,
      now: () => now,
    });

    expect(result.scanned).toBe(1);
    expect(result.promoted).toBe(0);
    expect(result.stillPending).toBe(1);
    expect(result.skipped).toBe(0);
    expect(mockPrisma.objectStorageLocation.update).toHaveBeenCalledWith({
      where: { id: "loc_pending" },
      data: {
        lastHeadAt: now,
      },
    });
  });

  it("skips location when object or binding lookup is missing", async () => {
    mockPrisma.objectStorageLocation.findMany.mockResolvedValue([
      {
        id: "loc_pending",
        objectId: "obj_1",
        bindingId: "binding_target",
        locationRole: "replica",
        status: "pending_backfill",
      },
    ]);
    mockPrisma.object.findUnique.mockResolvedValue(null);

    const result = await runPendingBackfillVerification({
      prisma: mockPrisma as any,
      factory: mockFactory as any,
      now: () => now,
    });

    expect(result.scanned).toBe(1);
    expect(result.promoted).toBe(0);
    expect(result.stillPending).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockFactory.getOrCreate).not.toHaveBeenCalled();
    expect(mockPrisma.objectStorageLocation.update).not.toHaveBeenCalled();
  });
});

describe("startPendingBackfillVerificationLoop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("runs verification immediately and on each interval", async () => {
    const runVerification = vi.fn().mockResolvedValue({
      scanned: 1,
      promoted: 1,
      stillPending: 0,
      skipped: 0,
    });

    const loop = startPendingBackfillVerificationLoop({
      prisma: mockPrisma as any,
      factory: mockFactory as any,
      intervalMs: 60_000,
      runVerification,
    });

    await vi.runAllTicks();
    await Promise.resolve();
    expect(runVerification).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runVerification).toHaveBeenCalledTimes(2);

    loop.stop();
  });

  it("does not start a second verification while the previous run is still in flight", async () => {
    let releaseRun!: () => void;
    const runVerification = vi.fn(
      (_input: any): Promise<void> =>
        new Promise<void>((resolve) => {
          releaseRun = resolve;
        }),
    );

    const loop = startPendingBackfillVerificationLoop({
      prisma: mockPrisma as any,
      factory: mockFactory as any,
      intervalMs: 60_000,
      runVerification,
    });

    await vi.runAllTicks();
    await Promise.resolve();
    expect(runVerification).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runVerification).toHaveBeenCalledTimes(1);

    releaseRun();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runVerification).toHaveBeenCalledTimes(2);

    loop.stop();
  });
});
