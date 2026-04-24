/**
 * Release Service routes.
 *
 * POST   /v1/releases                   — create a release record
 * GET    /v1/releases/latest            — get the active release for a project/platform/env/channel
 * GET    /v1/releases/check             — evaluate update policy for a client version
 * GET    /v1/releases                   — list releases with optional filters
 * PATCH  /v1/releases/:releaseId        — update release metadata / rollout state
 * DELETE /v1/releases/:releaseId        — delete a release
 * POST   /v1/release-channels/activate  — activate a release for a channel
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { DeliveryPolicyResolver } from "@srs/delivery-policy";
import { getPrisma } from "../db.js";

function resolveProjectKey(request: FastifyRequest): string | undefined {
  const headerKey = request.headers["x-project-key"];
  if (typeof headerKey === "string" && headerKey.trim().length > 0) {
    return headerKey.trim();
  }
  return undefined;
}

interface CreateReleaseBody {
  project: string;
  platform: "ios" | "android" | "desktop";
  env: "dev" | "staging" | "prod" | "prd";
  channel?: string;
  appVersion: string;
  buildNumber: number;
  semanticVersion?: string;
  distributionTarget: string;
  distributionUrl?: string;
  artifactObjectKey?: string;
  releaseNotes?: string;
  changelog?: string;
  forceUpdate?: boolean;
  minSupportedVersion?: string;
  rolloutPercent?: number;
  rolloutStatus?: string;
}

interface ActivateReleaseChannelBody {
  releaseId: string;
  channel?: string;
}

const VALID_PLATFORMS = ["ios", "android", "desktop"];
const VALID_ENVS = ["dev", "staging", "prod"];
const VALID_ROLLOUT_STATUSES = ["draft", "active", "paused", "completed"];

type ParsedVersion = {
  major: number;
  minor: number;
  patch: number;
  build: number | null;
};

function normalizeEnv(raw: unknown): string {
  const normalized = String(raw || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "prod" || normalized === "production" || normalized === "prd") return "prod";
  return normalized;
}

function normalizeResolverEnv(env: string): "dev" | "staging" | "prod" | "prd" {
  if (env === "prd") return "prod";
  if (env === "staging") return "staging";
  if (env === "dev") return "dev";
  return "prod";
}

function normalizeChannel(raw: unknown): string {
  const normalized = String(raw || "official").trim().toLowerCase();
  return normalized || "official";
}

function parseVersion(raw: unknown): ParsedVersion | null {
  if (raw === undefined || raw === null) return null;
  const cleaned = String(raw).trim().replace(/^v/i, "");
  if (!cleaned) return null;

  const [mainPart, buildPart] = cleaned.split("+");
  const parts = mainPart.split(".").map((value) => Number.parseInt(value, 10) || 0);
  while (parts.length < 3) {
    parts.push(0);
  }

  return {
    major: parts[0],
    minor: parts[1],
    patch: parts[2],
    build: buildPart ? Number.parseInt(buildPart, 10) || 0 : null,
  };
}

function compareVersions(leftRaw: unknown, rightRaw: unknown): number {
  const left = parseVersion(leftRaw);
  const right = parseVersion(rightRaw);

  if (!left || !right) return 0;
  if (left.major !== right.major) return left.major > right.major ? 1 : -1;
  if (left.minor !== right.minor) return left.minor > right.minor ? 1 : -1;
  if (left.patch !== right.patch) return left.patch > right.patch ? 1 : -1;
  if (left.build !== null && right.build !== null && left.build !== right.build) {
    return left.build > right.build ? 1 : -1;
  }
  return 0;
}

function isNewerRelease(currentVersion: string, semanticVersion: string, buildNumber: number): boolean {
  const current = parseVersion(currentVersion);
  const latest = parseVersion(semanticVersion);

  if (!current || !latest) return false;
  const semanticCompare = compareVersions(currentVersion, semanticVersion);
  if (semanticCompare < 0) return true;
  if (semanticCompare > 0) return false;

  const currentBuild = current.build || 0;
  return currentBuild < buildNumber;
}

function buildSemanticVersion(appVersion: string, buildNumber: number, semanticVersion?: string): string {
  const normalized = String(semanticVersion || "").trim();
  if (normalized) return normalized;
  return `${appVersion}+${buildNumber}`;
}

/**
 * Hash a device seed to a bucket in [0, 99].
 * Must match the Dart client's VersionCheckService.hashToBucket exactly.
 */
function hashToBucket(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = ((hash * 31 + seed.charCodeAt(i)) & 0xffffffff) >>> 0;
  }
  return hash % 100;
}

function unauthorizedEnvReply(reply: FastifyReply, requestedEnv: string, runtimeEnv?: string) {
  return reply.status(403).send({
    error: "env access denied",
    message: `token runtimeEnv "${runtimeEnv}" cannot access "${requestedEnv}"`,
  });
}

function assertAuthorizedEnv(
  request: FastifyRequest,
  reply: FastifyReply,
  requestedEnv: string,
): boolean {
  const tokenEnv = normalizeEnv(request.runtimeEnv);
  const normalizedRequestedEnv = normalizeEnv(requestedEnv);

  if (!tokenEnv || !normalizedRequestedEnv) {
    return true;
  }

  if (tokenEnv !== normalizedRequestedEnv) {
    unauthorizedEnvReply(reply, normalizedRequestedEnv, tokenEnv);
    return false;
  }

  return true;
}

async function resolveDistributionUrl(
  resolver: DeliveryPolicyResolver,
  body: Partial<CreateReleaseBody>,
): Promise<string> {
  const prisma = getPrisma();
  let distributionUrl = body.distributionUrl;

  if (!distributionUrl && body.artifactObjectKey) {
    const objectRecord = await prisma.object.findUnique({
      where: { objectKey: body.artifactObjectKey },
    });

    const accessClass = objectRecord?.accessClass || "public-stable";
    const objectProfile = objectRecord?.objectProfile || "release_artifact";

    const result = resolver.resolve({
      env: normalizeResolverEnv(normalizeEnv(body.env)),
      accessClass,
      objectKey: body.artifactObjectKey,
      objectProfile,
    });

    if (result.type === "public_url" && result.url) {
      distributionUrl = result.url;
    }
  }

  return distributionUrl || "";
}

async function getChannelState(
  projectKey: string,
  platform: string,
  env: string,
  channel: string,
) {
  const prisma = getPrisma();
  return prisma.releaseChannel.findUnique({
    where: {
      projectKey_platform_env_channel: {
        projectKey,
        platform,
        env,
        channel,
      },
    },
  });
}

async function getActiveReleaseForChannel(params: {
  projectKey: string;
  platform: string;
  env: string;
  channel: string;
}) {
  const prisma = getPrisma();
  const channelState = await getChannelState(
    params.projectKey,
    params.platform,
    params.env,
    params.channel,
  );

  if (channelState?.activeReleaseId) {
    const activeRelease = await prisma.appRelease.findUnique({
      where: { id: channelState.activeReleaseId },
    });

    if (
      activeRelease &&
      activeRelease.projectKey === params.projectKey &&
      activeRelease.platform === params.platform &&
      activeRelease.env === params.env &&
      activeRelease.channel === params.channel
    ) {
      return activeRelease;
    }
  }

  return prisma.appRelease.findFirst({
    where: {
      projectKey: params.projectKey,
      platform: params.platform,
      env: params.env,
      channel: params.channel,
      rolloutStatus: { in: ["active"] },
    },
    orderBy: { createdAt: "desc" },
  });
}

async function activateReleaseChannel(params: {
  projectKey: string;
  releaseId: string;
  platform: string;
  env: string;
  channel: string;
  actorId: string;
}) {
  const prisma = getPrisma();
  const where = {
    projectKey_platform_env_channel: {
      projectKey: params.projectKey,
      platform: params.platform,
      env: params.env,
      channel: params.channel,
    },
  };

  const existingChannel = await prisma.releaseChannel.findUnique({ where });
  const previousActiveReleaseId = existingChannel?.activeReleaseId || null;

  await prisma.releaseChannel.upsert({
    where,
    create: {
      projectKey: params.projectKey,
      platform: params.platform,
      env: params.env,
      channel: params.channel,
      activeReleaseId: params.releaseId,
    },
    update: {
      activeReleaseId: params.releaseId,
    },
  });

  if (previousActiveReleaseId && previousActiveReleaseId !== params.releaseId) {
    await prisma.appRelease.updateMany({
      where: {
        id: previousActiveReleaseId,
        projectKey: params.projectKey,
      },
      data: {
        rolloutStatus: "paused",
      },
    });
  }

  const activatedRelease = await prisma.appRelease.update({
    where: { id: params.releaseId },
    data: { rolloutStatus: "active" },
  });

  await prisma.auditLog.create({
    data: {
      action: "activate_release_channel",
      actorType: "service_token",
      actorId: params.actorId,
      resource: `release_channel:${params.projectKey}:${params.platform}:${params.env}:${params.channel}`,
      detail: JSON.stringify({
        releaseId: params.releaseId,
        previousActiveReleaseId,
      }),
    },
  });

  return { activatedRelease, previousActiveReleaseId };
}

async function clearActiveChannelIfNeeded(params: {
  projectKey: string;
  releaseId: string;
  platform: string;
  env: string;
  channel: string;
  actorId: string;
}) {
  const prisma = getPrisma();
  const where = {
    projectKey_platform_env_channel: {
      projectKey: params.projectKey,
      platform: params.platform,
      env: params.env,
      channel: params.channel,
    },
  };

  const existingChannel = await prisma.releaseChannel.findUnique({ where });
  if (!existingChannel?.activeReleaseId || existingChannel.activeReleaseId !== params.releaseId) {
    return false;
  }

  await prisma.releaseChannel.update({
    where,
    data: { activeReleaseId: null },
  });

  await prisma.auditLog.create({
    data: {
      action: "clear_release_channel",
      actorType: "service_token",
      actorId: params.actorId,
      resource: `release_channel:${params.projectKey}:${params.platform}:${params.env}:${params.channel}`,
      detail: JSON.stringify({
        releaseId: params.releaseId,
      }),
    },
  });

  return true;
}

function serializeRelease(
  release: {
    id: string;
    projectKey: string;
    platform: string;
    env: string;
    channel: string;
    appVersion: string;
    buildNumber: number;
    semanticVersion: string;
    distributionTarget: string;
    distributionUrl: string;
    artifactObjectKey: string | null;
    releaseNotes: string | null;
    changelog: string | null;
    forceUpdate: boolean;
    minSupportedVersion: string | null;
    rolloutStatus: string;
    rolloutPercent: number;
    createdBy: string;
    createdAt: Date;
  },
  extra: Record<string, unknown> = {},
) {
  return {
    id: release.id,
    projectKey: release.projectKey,
    platform: release.platform,
    env: release.env,
    channel: release.channel,
    appVersion: release.appVersion,
    buildNumber: release.buildNumber,
    semanticVersion: release.semanticVersion,
    distributionTarget: release.distributionTarget,
    distributionUrl: release.distributionUrl,
    artifactObjectKey: release.artifactObjectKey,
    releaseNotes: release.releaseNotes,
    changelog: release.changelog,
    forceUpdate: release.forceUpdate,
    minSupportedVersion: release.minSupportedVersion,
    rolloutStatus: release.rolloutStatus,
    rolloutPercent: release.rolloutPercent,
    createdBy: release.createdBy,
    createdAt: release.createdAt.toISOString(),
    ...extra,
  };
}

export async function registerReleasesRoutes(app: FastifyInstance): Promise<void> {
  const resolver = new DeliveryPolicyResolver({
    publicStableDomains: {
      dev: "https://dl-dev.infinex.cn",
      staging: "https://dl-dev.infinex.cn",
      prod: "https://dl.infinex.cn",
    },
  });

  app.post(
    "/v1/releases",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = request.projectKey;
      if (!projectKey) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const body = request.body as Partial<CreateReleaseBody>;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const required: (keyof CreateReleaseBody)[] = [
        "platform",
        "env",
        "appVersion",
        "buildNumber",
        "distributionTarget",
      ];
      for (const field of required) {
        if (body[field] === undefined || body[field] === null || body[field] === "") {
          return reply.status(400).send({ error: `field "${field}" is required` });
        }
      }

      const platform = String(body.platform || "").trim().toLowerCase();
      const env = normalizeEnv(body.env);
      const channel = normalizeChannel(body.channel);
      const rolloutStatus = body.rolloutStatus ? String(body.rolloutStatus).trim().toLowerCase() : "draft";

      if (!assertAuthorizedEnv(request, reply, env)) {
        return;
      }
      if (!VALID_PLATFORMS.includes(platform)) {
        return reply.status(400).send({
          error: `invalid platform "${body.platform}". Allowed: ${VALID_PLATFORMS.join(", ")}`,
        });
      }
      if (!VALID_ENVS.includes(env)) {
        return reply.status(400).send({
          error: `invalid env "${body.env}". Allowed: ${VALID_ENVS.join(", ")}`,
        });
      }
      if (typeof body.buildNumber !== "number" || body.buildNumber <= 0) {
        return reply.status(400).send({ error: "field \"buildNumber\" must be a positive number" });
      }
      if (!VALID_ROLLOUT_STATUSES.includes(rolloutStatus)) {
        return reply.status(400).send({
          error: `invalid rolloutStatus "${body.rolloutStatus}". Allowed: ${VALID_ROLLOUT_STATUSES.join(", ")}`,
        });
      }
      if (
        body.rolloutPercent !== undefined &&
        (typeof body.rolloutPercent !== "number" || body.rolloutPercent < 0 || body.rolloutPercent > 100)
      ) {
        return reply.status(400).send({ error: "field \"rolloutPercent\" must be between 0 and 100" });
      }

      const prisma = getPrisma();
      const distributionUrl = await resolveDistributionUrl(resolver, body);

      const createdRelease = await prisma.appRelease.create({
        data: {
          projectKey,
          platform,
          env,
          channel,
          appVersion: String(body.appVersion || "").trim(),
          buildNumber: body.buildNumber,
          semanticVersion: buildSemanticVersion(
            String(body.appVersion || "").trim(),
            body.buildNumber,
            body.semanticVersion,
          ),
          distributionTarget: String(body.distributionTarget || "").trim(),
          distributionUrl,
          artifactObjectKey: body.artifactObjectKey ?? null,
          releaseNotes: body.releaseNotes ?? null,
          changelog: body.changelog ?? null,
          forceUpdate: body.forceUpdate === true,
          minSupportedVersion: body.minSupportedVersion ?? null,
          rolloutStatus,
          rolloutPercent: body.rolloutPercent ?? 100,
          createdBy: projectKey,
        },
      });

      await prisma.auditLog.create({
        data: {
          action: "create_release",
          actorType: "service_token",
          actorId: projectKey,
          resource: `release:${createdRelease.id}`,
          detail: JSON.stringify({
            platform,
            env,
            channel,
            semanticVersion: createdRelease.semanticVersion,
            buildNumber: createdRelease.buildNumber,
          }),
        },
      });

      let release = createdRelease;
      let channelActive = false;

      if (rolloutStatus === "active") {
        const activation = await activateReleaseChannel({
          projectKey,
          releaseId: createdRelease.id,
          platform,
          env,
          channel,
          actorId: projectKey,
        });
        release = activation.activatedRelease;
        channelActive = true;
      }

      return reply.status(201).send(
        serializeRelease(release, {
          channelActive,
        }),
      );
    },
  );

  app.get(
    "/v1/releases/latest",
    { config: { skipAuth: true } } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = resolveProjectKey(request);
      if (!projectKey) {
        return reply.status(400).send({ error: "X-Project-Key header is required" });
      }

      const query = request.query as Record<string, string | undefined>;
      const platform = String(query.platform || "").trim().toLowerCase();
      const env = normalizeEnv(query.env || "");
      const channel = normalizeChannel(query.channel);
      const deviceId = query.deviceId;

      if (!VALID_PLATFORMS.includes(platform)) {
        return reply.status(400).send({ error: "query param \"platform\" is required (ios|android|desktop)" });
      }
      if (!VALID_ENVS.includes(env)) {
        return reply.status(400).send({ error: "query param \"env\" is required (dev|staging|prod)" });
      }

      const release = await getActiveReleaseForChannel({
        projectKey,
        platform,
        env,
        channel,
      });

      if (!release) {
        return reply.status(404).send({ error: "no release found" });
      }

      let rolloutAllowed: boolean | undefined;
      let rolloutBucket: number | undefined;
      if (deviceId) {
        rolloutBucket = hashToBucket(deviceId);
        rolloutAllowed = rolloutBucket < release.rolloutPercent;
      }

      return reply.status(200).send(
        serializeRelease(release, {
          channelActive: true,
          ...(rolloutAllowed !== undefined ? { rolloutAllowed } : {}),
          ...(rolloutBucket !== undefined ? { rolloutBucket } : {}),
        }),
      );
    },
  );

  app.get(
    "/v1/releases/check",
    { config: { skipAuth: true } } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = resolveProjectKey(request);
      if (!projectKey) {
        return reply.status(400).send({ error: "X-Project-Key header is required" });
      }

      const query = request.query as Record<string, string | undefined>;
      const platform = String(query.platform || "").trim().toLowerCase();
      const env = normalizeEnv(query.env || "");
      const channel = normalizeChannel(query.channel);
      const currentVersion = String(query.currentVersion || "").trim();
      const deviceId = String(query.deviceId || "").trim();

      if (!VALID_PLATFORMS.includes(platform)) {
        return reply.status(400).send({ error: "query param \"platform\" is required (ios|android|desktop)" });
      }
      if (!VALID_ENVS.includes(env)) {
        return reply.status(400).send({ error: "query param \"env\" is required (dev|staging|prod)" });
      }
      if (!currentVersion) {
        return reply.status(400).send({ error: "query param \"currentVersion\" is required" });
      }

      const release = await getActiveReleaseForChannel({
        projectKey,
        platform,
        env,
        channel,
      });

      if (!release) {
        return reply.status(200).send({
          projectKey,
          platform,
          env,
          channel,
          currentVersion,
          latestVersion: currentVersion,
          minSupportedVersion: currentVersion,
          buildNumber: null,
          distributionTarget: "",
          distributionUrl: "",
          releaseNotes: "",
          rolloutStatus: "inactive",
          rolloutPercent: 0,
          rolloutBucket: hashToBucket(deviceId || "default"),
          rolloutAllowed: false,
          hasNewer: false,
          shouldPrompt: false,
          forceUpdate: false,
          updateType: "none",
          reason: "no_active_release",
        });
      }

      const rolloutBucket = hashToBucket(deviceId || "default");
      const rolloutAllowed = rolloutBucket < release.rolloutPercent;
      const minSupportedVersion = release.minSupportedVersion || release.semanticVersion;
      const hasNewer = isNewerRelease(currentVersion, release.semanticVersion, release.buildNumber);
      const belowMinSupported = compareVersions(currentVersion, minSupportedVersion) < 0;
      const forceUpdate = hasNewer && (release.forceUpdate || belowMinSupported);
      const shouldPrompt = forceUpdate ? true : hasNewer && rolloutAllowed;

      return reply.status(200).send({
        ...serializeRelease(release, {
          channelActive: true,
        }),
        currentVersion,
        latestVersion: release.semanticVersion,
        minSupportedVersion,
        rolloutBucket,
        rolloutAllowed,
        hasNewer,
        shouldPrompt,
        forceUpdate,
        updateType: forceUpdate ? "force" : shouldPrompt ? "optional" : "none",
        reason: !hasNewer
          ? "up_to_date"
          : forceUpdate
            ? "force_update"
            : shouldPrompt
              ? "optional_update"
              : "outside_rollout",
      });
    },
  );

  app.get(
    "/v1/releases",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = request.projectKey;
      if (!projectKey) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const query = request.query as Record<string, string | undefined>;
      const platform = query.platform ? String(query.platform).trim().toLowerCase() : "";
      const channel = query.channel ? normalizeChannel(query.channel) : "";
      const env = normalizeEnv(query.env || request.runtimeEnv);
      const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
      const offset = Math.max(Number(query.offset) || 0, 0);

      if (platform && !VALID_PLATFORMS.includes(platform)) {
        return reply.status(400).send({ error: `invalid platform "${platform}"` });
      }
      if (env && !VALID_ENVS.includes(env)) {
        return reply.status(400).send({ error: `invalid env "${env}"` });
      }
      if (query.env && !assertAuthorizedEnv(request, reply, env)) {
        return;
      }

      const where: Record<string, unknown> = { projectKey };
      if (platform) where.platform = platform;
      if (env) where.env = env;
      if (channel) where.channel = channel;

      const prisma = getPrisma();
      const [releases, total, channelStates] = await Promise.all([
        prisma.appRelease.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.appRelease.count({ where }),
        prisma.releaseChannel.findMany({
          where: {
            projectKey,
            ...(platform ? { platform } : {}),
            ...(env ? { env } : {}),
            ...(channel ? { channel } : {}),
          },
        }),
      ]);

      const activeIds = new Set(
        channelStates
          .map((item) => item.activeReleaseId)
          .filter((value): value is string => Boolean(value)),
      );

      return reply.status(200).send({
        data: releases.map((release) =>
          serializeRelease(release, {
            channelActive: activeIds.has(release.id),
          }),
        ),
        total,
        limit,
        offset,
      });
    },
  );

  app.post(
    "/v1/release-channels/activate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = request.projectKey;
      if (!projectKey) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const body = request.body as Partial<ActivateReleaseChannelBody>;
      const releaseId = String(body?.releaseId || "").trim();
      if (!releaseId) {
        return reply.status(400).send({ error: "field \"releaseId\" is required" });
      }

      const prisma = getPrisma();
      const release = await prisma.appRelease.findUnique({ where: { id: releaseId } });
      if (!release) {
        return reply.status(404).send({ error: "release not found" });
      }
      if (release.projectKey !== projectKey) {
        return reply.status(403).send({ error: "release does not belong to this project" });
      }
      if (!assertAuthorizedEnv(request, reply, release.env)) {
        return;
      }

      const channel = normalizeChannel(body?.channel || release.channel);
      if (channel !== release.channel) {
        return reply.status(400).send({
          error: `release channel mismatch: release=${release.channel}, request=${channel}`,
        });
      }

      const activation = await activateReleaseChannel({
        projectKey,
        releaseId: release.id,
        platform: release.platform,
        env: release.env,
        channel,
        actorId: projectKey,
      });

      return reply.status(200).send({
        channel,
        activeReleaseId: activation.activatedRelease.id,
        previousActiveReleaseId: activation.previousActiveReleaseId,
        release: serializeRelease(activation.activatedRelease, {
          channelActive: true,
        }),
      });
    },
  );

  app.patch(
    "/v1/releases/:releaseId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = request.projectKey;
      if (!projectKey) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const { releaseId } = request.params as { releaseId: string };
      if (!releaseId) {
        return reply.status(400).send({ error: "releaseId parameter is required" });
      }

      const body = request.body as Record<string, unknown>;
      if (!body || Object.keys(body).length === 0) {
        return reply.status(400).send({ error: "request body must contain at least one field to update" });
      }

      const allowedFields = new Set([
        "appVersion",
        "buildNumber",
        "semanticVersion",
        "rolloutStatus",
        "rolloutPercent",
        "forceUpdate",
        "minSupportedVersion",
        "distributionTarget",
        "distributionUrl",
        "releaseNotes",
        "changelog",
      ]);

      const prisma = getPrisma();
      const existing = await prisma.appRelease.findUnique({ where: { id: releaseId } });
      if (!existing) {
        return reply.status(404).send({ error: "release not found" });
      }
      if (existing.projectKey !== projectKey) {
        return reply.status(403).send({ error: "release does not belong to this project" });
      }
      if (!assertAuthorizedEnv(request, reply, existing.env)) {
        return;
      }

      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (allowedFields.has(key)) {
          updateData[key] = value;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return reply.status(400).send({ error: "no valid fields to update" });
      }

      if (
        updateData.buildNumber !== undefined &&
        (typeof updateData.buildNumber !== "number" || Number(updateData.buildNumber) <= 0)
      ) {
        return reply.status(400).send({ error: "field \"buildNumber\" must be a positive number" });
      }
      if (
        updateData.rolloutPercent !== undefined &&
        (typeof updateData.rolloutPercent !== "number" ||
          Number(updateData.rolloutPercent) < 0 ||
          Number(updateData.rolloutPercent) > 100)
      ) {
        return reply.status(400).send({ error: "field \"rolloutPercent\" must be between 0 and 100" });
      }
      if (
        updateData.rolloutStatus !== undefined &&
        !VALID_ROLLOUT_STATUSES.includes(String(updateData.rolloutStatus))
      ) {
        return reply.status(400).send({
          error: `invalid rolloutStatus "${updateData.rolloutStatus}". Allowed: ${VALID_ROLLOUT_STATUSES.join(", ")}`,
        });
      }

      const nextAppVersion = String(updateData.appVersion || existing.appVersion).trim();
      const nextBuildNumber = Number(
        updateData.buildNumber !== undefined ? updateData.buildNumber : existing.buildNumber,
      );
      const nextSemanticVersion = buildSemanticVersion(
        nextAppVersion,
        nextBuildNumber,
        typeof updateData.semanticVersion === "string"
          ? String(updateData.semanticVersion)
          : existing.semanticVersion,
      );

      updateData.appVersion = nextAppVersion;
      updateData.buildNumber = nextBuildNumber;
      updateData.semanticVersion = nextSemanticVersion;

      let updated = await prisma.appRelease.update({
        where: { id: releaseId },
        data: updateData,
      });

      let channelActive = false;
      if (updateData.rolloutStatus === "active") {
        const activation = await activateReleaseChannel({
          projectKey,
          releaseId,
          platform: existing.platform,
          env: existing.env,
          channel: existing.channel,
          actorId: projectKey,
        });
        updated = activation.activatedRelease;
        channelActive = true;
      } else {
        if (
          updateData.rolloutStatus === "draft" ||
          updateData.rolloutStatus === "paused" ||
          updateData.rolloutStatus === "completed"
        ) {
          await clearActiveChannelIfNeeded({
            projectKey,
            releaseId,
            platform: existing.platform,
            env: existing.env,
            channel: existing.channel,
            actorId: projectKey,
          });
        }

        const channelState = await getChannelState(projectKey, existing.platform, existing.env, existing.channel);
        channelActive = channelState?.activeReleaseId === releaseId;
      }

      await prisma.auditLog.create({
        data: {
          action: "update_release",
          actorType: "service_token",
          actorId: projectKey,
          resource: `release:${releaseId}`,
          detail: JSON.stringify({
            updatedFields: Object.keys(updateData),
            previousRolloutStatus: existing.rolloutStatus,
            newRolloutStatus: updated.rolloutStatus,
          }),
        },
      });

      return reply.status(200).send(
        serializeRelease(updated, {
          channelActive,
        }),
      );
    },
  );

  app.delete(
    "/v1/releases/:releaseId",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = request.projectKey;
      if (!projectKey) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const { releaseId } = request.params as { releaseId: string };
      if (!releaseId) {
        return reply.status(400).send({ error: "releaseId parameter is required" });
      }

      const prisma = getPrisma();
      const existing = await prisma.appRelease.findUnique({ where: { id: releaseId } });
      if (!existing) {
        return reply.status(404).send({ error: "release not found" });
      }
      if (existing.projectKey !== projectKey) {
        return reply.status(403).send({ error: "release does not belong to this project" });
      }
      if (!assertAuthorizedEnv(request, reply, existing.env)) {
        return;
      }

      await clearActiveChannelIfNeeded({
        projectKey,
        releaseId,
        platform: existing.platform,
        env: existing.env,
        channel: existing.channel,
        actorId: projectKey,
      });

      await prisma.appRelease.delete({ where: { id: releaseId } });
      await prisma.auditLog.create({
        data: {
          action: "delete_release",
          actorType: "service_token",
          actorId: projectKey,
          resource: `release:${releaseId}`,
          detail: JSON.stringify({
            platform: existing.platform,
            env: existing.env,
            channel: existing.channel,
          }),
        },
      });

      return reply.status(200).send({ id: releaseId, deleted: true });
    },
  );
}
