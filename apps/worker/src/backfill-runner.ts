interface BackfillHeadResult {
  exists: boolean;
}

interface BackfillObjectAdapter {
  headObject(args: { objectKey: string }): Promise<BackfillHeadResult>;
}

interface BackfillAdapterFactory {
  getOrCreate(binding: unknown): BackfillObjectAdapter;
}

export interface BackfillVerificationLoop {
  stop(): void;
}

interface PendingBackfillLocation {
  id: string;
  objectId: string;
  bindingId: string;
  locationRole: string;
  status: string;
}

export interface BackfillPrisma {
  objectStorageLocation: {
    findMany(args: {
      where: {
        locationRole: string;
        status: string;
      };
      orderBy: {
        createdAt: "asc";
      };
    }): Promise<PendingBackfillLocation[]>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
  object: {
    findUnique(args: {
      where: { id: string };
    }): Promise<{ id: string; objectKey: string } | null>;
  };
  projectServiceBinding: {
    findUnique(args: {
      where: { id: string };
    }): Promise<any>;
  };
}

export interface RunPendingBackfillVerificationInput {
  prisma: BackfillPrisma;
  factory: BackfillAdapterFactory;
  now?: () => Date;
}

export interface BackfillVerificationResult {
  scanned: number;
  promoted: number;
  stillPending: number;
  skipped: number;
}

export async function runPendingBackfillVerification(
  input: RunPendingBackfillVerificationInput,
): Promise<BackfillVerificationResult> {
  const now = input.now ?? (() => new Date());
  const locations = await input.prisma.objectStorageLocation.findMany({
    where: {
      locationRole: "replica",
      status: "pending_backfill",
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const result: BackfillVerificationResult = {
    scanned: locations.length,
    promoted: 0,
    stillPending: 0,
    skipped: 0,
  };

  for (const location of locations) {
    const objectRecord = await input.prisma.object.findUnique({
      where: { id: location.objectId },
    });

    if (!objectRecord) {
      result.skipped += 1;
      continue;
    }

    const binding = await input.prisma.projectServiceBinding.findUnique({
      where: { id: location.bindingId },
    });

    if (!binding) {
      result.skipped += 1;
      continue;
    }

    const adapter = input.factory.getOrCreate(binding);
    const headResult = await adapter.headObject({
      objectKey: objectRecord.objectKey,
    });

    if (headResult.exists) {
      const timestamp = now();
      await input.prisma.objectStorageLocation.update({
        where: { id: location.id },
        data: {
          status: "active",
          lastHeadAt: timestamp,
          checksumVerifiedAt: timestamp,
        },
      });
      result.promoted += 1;
      continue;
    }

    await input.prisma.objectStorageLocation.update({
      where: { id: location.id },
      data: {
        lastHeadAt: now(),
      },
    });
    result.stillPending += 1;
  }

  return result;
}

export function startPendingBackfillVerificationLoop(
  input: RunPendingBackfillVerificationInput & {
    intervalMs: number;
    runVerification?: (
      input: RunPendingBackfillVerificationInput,
    ) => Promise<BackfillVerificationResult | void>;
    onError?: (error: unknown) => void;
  },
): BackfillVerificationLoop {
  const runVerification = input.runVerification ?? runPendingBackfillVerification;
  const onError = input.onError ?? ((error) => console.error("[worker] backfill verification failed", error));

  let stopped = false;
  let inFlight = false;

  const tick = async () => {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;
    try {
      await runVerification(input);
    } catch (error) {
      onError(error);
    } finally {
      inFlight = false;
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, input.intervalMs);

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
