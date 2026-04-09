/**
 * Release Service routes.
 *
 * POST   /v1/releases          — create a release record
 * GET    /v1/releases/latest    — get the latest release for a project/platform/env
 * GET    /v1/releases           — list releases with optional filters
 * PATCH  /v1/releases/:releaseId — update rollout / force update / distribution
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";

// --- Create Release ---

interface CreateReleaseBody {
  project: string;
  platform: "ios" | "android" | "desktop";
  env: "dev" | "staging" | "prod";
  appVersion: string;
  buildNumber: number;
  semanticVersion: string;
  distributionTarget: string;
  distributionUrl: string;
  artifactObjectKey?: string;
  releaseNotes?: string;
  changelog?: string;
}

const VALID_PLATFORMS = ["ios", "android", "desktop"];
const VALID_ENVS = ["dev", "staging", "prod"];

export async function registerReleasesRoutes(app: FastifyInstance): Promise<void> {
  // POST /v1/releases
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

      // Validate required fields
      const required: (keyof CreateReleaseBody)[] = [
        "platform", "env", "appVersion", "buildNumber",
        "semanticVersion", "distributionTarget",
      ];
      for (const field of required) {
        if (body[field] === undefined || body[field] === null || body[field] === "") {
          return reply.status(400).send({ error: `field "${field}" is required` });
        }
      }

      if (!VALID_PLATFORMS.includes(body.platform!)) {
        return reply.status(400).send({ error: `invalid platform "${body.platform}". Allowed: ${VALID_PLATFORMS.join(", ")}` });
      }
      if (!VALID_ENVS.includes(body.env!)) {
        return reply.status(400).send({ error: `invalid env "${body.env}". Allowed: ${VALID_ENVS.join(", ")}` });
      }
      if (typeof body.buildNumber !== "number" || body.buildNumber <= 0) {
        return reply.status(400).send({ error: "field \"buildNumber\" must be a positive number" });
      }

      const prisma = getPrisma();

      // Create release record
      const release = await prisma.appRelease.create({
        data: {
          projectKey,
          platform: body.platform!,
          env: body.env!,
          appVersion: body.appVersion!,
          buildNumber: body.buildNumber!,
          semanticVersion: body.semanticVersion!,
          distributionTarget: body.distributionTarget!,
          distributionUrl: body.distributionUrl ?? "",
          artifactObjectKey: body.artifactObjectKey ?? null,
          releaseNotes: body.releaseNotes ?? null,
          changelog: body.changelog ?? null,
          forceUpdate: false,
          rolloutStatus: "draft",
          createdBy: projectKey,
        },
      });

      // Write audit log
      await prisma.auditLog.create({
        data: {
          action: "create_release",
          actorType: "service_token",
          actorId: projectKey,
          resource: `release:${release.id}`,
          detail: JSON.stringify({
            platform: body.platform,
            semanticVersion: body.semanticVersion,
            buildNumber: body.buildNumber,
          }),
        },
      });

      return reply.status(201).send({
        id: release.id,
        projectKey: release.projectKey,
        platform: release.platform,
        env: release.env,
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
        createdBy: release.createdBy,
        createdAt: release.createdAt.toISOString(),
      });
    }
  );

  // GET /v1/releases/latest?project=infov&platform=android&env=prod
  app.get(
    "/v1/releases/latest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = request.projectKey;
      if (!projectKey) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const query = request.query as Record<string, string | undefined>;
      const platform = query.platform;
      const env = query.env;

      if (!platform || !VALID_PLATFORMS.includes(platform)) {
        return reply.status(400).send({ error: "query param \"platform\" is required (ios|android|desktop)" });
      }
      if (!env || !VALID_ENVS.includes(env)) {
        return reply.status(400).send({ error: "query param \"env\" is required (dev|staging|prod)" });
      }

      const prisma = getPrisma();
      const release = await prisma.appRelease.findFirst({
        where: {
          projectKey,
          platform,
          env,
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      if (!release) {
        return reply.status(404).send({ error: "no release found" });
      }

      return reply.status(200).send({
        id: release.id,
        semanticVersion: release.semanticVersion,
        buildNumber: release.buildNumber,
        forceUpdate: release.forceUpdate,
        minSupportedVersion: release.minSupportedVersion,
        distributionTarget: release.distributionTarget,
        distributionUrl: release.distributionUrl,
        releaseNotes: release.releaseNotes,
        rolloutStatus: release.rolloutStatus,
        createdAt: release.createdAt.toISOString(),
      });
    }
  );

  // GET /v1/releases?platform=android&env=prod&limit=20&offset=0
  app.get(
    "/v1/releases",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = request.projectKey;
      if (!projectKey) {
        return reply.status(401).send({ error: "unauthorized" });
      }

      const query = request.query as Record<string, string | undefined>;
      const platform = query.platform;
      const env = query.env;
      const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
      const offset = Math.max(Number(query.offset) || 0, 0);

      const where: Record<string, unknown> = { projectKey };
      if (platform && VALID_PLATFORMS.includes(platform)) {
        where.platform = platform;
      }
      if (env && VALID_ENVS.includes(env)) {
        where.env = env;
      }

      const prisma = getPrisma();
      const [releases, total] = await Promise.all([
        prisma.appRelease.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: limit,
          skip: offset,
        }),
        prisma.appRelease.count({ where }),
      ]);

      return reply.status(200).send({
        data: releases.map((r) => ({
          id: r.id,
          platform: r.platform,
          env: r.env,
          appVersion: r.appVersion,
          buildNumber: r.buildNumber,
          semanticVersion: r.semanticVersion,
          distributionTarget: r.distributionTarget,
          distributionUrl: r.distributionUrl,
          forceUpdate: r.forceUpdate,
          minSupportedVersion: r.minSupportedVersion,
          rolloutStatus: r.rolloutStatus,
          createdAt: r.createdAt.toISOString(),
        })),
        total,
        limit,
        offset,
      });
    }
  );

  // PATCH /v1/releases/:releaseId
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

      // Whitelist of updatable fields
      const allowedFields = new Set([
        "rolloutStatus",
        "forceUpdate",
        "minSupportedVersion",
        "distributionTarget",
        "distributionUrl",
        "releaseNotes",
        "changelog",
      ]);

      const updateData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(body)) {
        if (allowedFields.has(key)) {
          updateData[key] = value;
        }
      }

      if (Object.keys(updateData).length === 0) {
        return reply.status(400).send({ error: "no valid fields to update" });
      }

      // Validate rolloutStatus if provided
      const validRolloutStatuses = ["draft", "active", "paused", "completed"];
      if (updateData.rolloutStatus && !validRolloutStatuses.includes(updateData.rolloutStatus as string)) {
        return reply.status(400).send({
          error: `invalid rolloutStatus "${updateData.rolloutStatus}". Allowed: ${validRolloutStatuses.join(", ")}`,
        });
      }

      const prisma = getPrisma();

      // Check release exists and belongs to this project
      const existing = await prisma.appRelease.findUnique({ where: { id: releaseId } });
      if (!existing) {
        return reply.status(404).send({ error: "release not found" });
      }
      if (existing.projectKey !== projectKey) {
        return reply.status(403).send({ error: "release does not belong to this project" });
      }

      const updated = await prisma.appRelease.update({
        where: { id: releaseId },
        data: updateData,
      });

      // Write audit log
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

      return reply.status(200).send({
        id: updated.id,
        platform: updated.platform,
        env: updated.env,
        appVersion: updated.appVersion,
        buildNumber: updated.buildNumber,
        semanticVersion: updated.semanticVersion,
        distributionTarget: updated.distributionTarget,
        distributionUrl: updated.distributionUrl,
        forceUpdate: updated.forceUpdate,
        minSupportedVersion: updated.minSupportedVersion,
        rolloutStatus: updated.rolloutStatus,
        releaseNotes: updated.releaseNotes,
        changelog: updated.changelog,
        createdAt: updated.createdAt.toISOString(),
      });
    }
  );
}
