/**
 * Feedback Service routes.
 *
 * GET  /v1/feedback/client-settings
 * POST /v1/feedback/submit-crash
 * POST /v1/feedback/submit-errors
 * POST /v1/feedback/submit-manual
 * GET  /v1/admin/feedback/submissions
 * GET  /v1/admin/feedback/submissions/:id
 * POST /v1/admin/feedback/submissions/:id/retry-github-sync
 * POST /v1/admin/feedback/process-pending
 * PUT  /v1/admin/feedback/project-config/:projectKey
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";

function parseJsonField(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function resolveScopedProjectKey(request: FastifyRequest) {
  return request.projectKey;
}

function ensureScopedProjectKeyMatch(
  reply: FastifyReply,
  authProjectKey: string | undefined,
  candidateProjectKey: string | undefined,
) {
  if (!authProjectKey) {
    return reply.status(403).send({ error: "project_key_missing" });
  }
  if (candidateProjectKey && candidateProjectKey !== authProjectKey) {
    return reply.status(403).send({ error: "project_key_mismatch" });
  }
  return null;
}

function canQueueGitHubSync(config: {
  githubIssueSyncEnabled?: boolean;
  githubRepoOwner?: string | null;
  githubRepoName?: string | null;
  githubToken?: string | null;
} | null | undefined) {
  return Boolean(config?.githubIssueSyncEnabled && config?.githubRepoOwner && config?.githubRepoName && config?.githubToken);
}

async function ensureActiveOutboxJob(prisma: any, submissionId: string, projectKey: string) {
  const activeJobs = await prisma.feedbackIssueOutbox.findMany({
    where: {
      submissionId,
      status: {
        in: ["pending", "processing"],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1,
  });

  if (Array.isArray(activeJobs) && activeJobs.length > 0) {
    return activeJobs[0];
  }

  return prisma.feedbackIssueOutbox.create({
    data: {
      submissionId,
      projectKey,
      status: "pending",
    },
  });
}

export async function registerFeedbackRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/feedback/client-settings",
    { config: { skipAuth: true } } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as Record<string, string | undefined>;
      const projectKey = query.projectKey;
      if (!projectKey) {
        return reply.status(400).send({ error: 'query param "projectKey" is required' });
      }

      const prisma = getPrisma() as any;
      const settings = await prisma.feedbackProjectConfig.findUnique({
        where: { projectKey },
      });
      const legacySettings = settings
        ? null
        : await prisma.feedbackClientSettings?.findUnique?.({ where: { projectKey } });

      return reply.status(200).send({
        errorReportingEnabled: settings?.errorReportingEnabled ?? legacySettings?.errorReportingEnabled ?? true,
        crashReportingEnabled: settings?.crashReportingEnabled ?? legacySettings?.crashReportingEnabled ?? true,
        manualFeedbackEnabled: settings?.manualFeedbackEnabled ?? true,
      });
    },
  );

  app.post(
    "/v1/feedback/submit-crash",
    { config: { skipAuth: true } } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const projectKey = body.projectKey as string | undefined;
      if (!projectKey) {
        return reply.status(400).send({ error: 'field "projectKey" is required' });
      }

      const prisma = getPrisma();
      const submission = await (prisma as any).feedbackSubmission.create({
        data: {
          projectKey,
          type: "crash",
          channel: "crash",
          errorMessage: (body.errorMessage as string) ?? null,
          errorType: (body.errorType as string) ?? null,
          stackTrace: (body.stackTrace as string) ?? null,
          source: (body.source as string) ?? null,
          logs: (body.logs as string) ?? null,
          deviceInfo:
            typeof body.deviceInfo === "object"
              ? JSON.stringify(body.deviceInfo)
              : (body.deviceInfo as string) ?? null,
          userId: (body.userId as string) ?? null,
          username: (body.username as string) ?? null,
          currentRoute: (body.currentRoute as string) ?? null,
          appVersion: (body.appVersion as string) ?? null,
          buildNumber: (body.buildNumber as string) ?? null,
        },
      });

      return reply.status(201).send({ success: true, crashId: submission.id });
    },
  );

  app.post(
    "/v1/feedback/submit-errors",
    { config: { skipAuth: true } } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const projectKey = body.projectKey as string | undefined;
      if (!projectKey) {
        return reply.status(400).send({ error: 'field "projectKey" is required' });
      }

      const errors = body.errors as Array<Record<string, unknown>> | undefined;
      if (!errors || !Array.isArray(errors) || errors.length === 0) {
        return reply.status(400).send({ error: 'field "errors" must be a non-empty array' });
      }

      const prisma = getPrisma();
      const results: Array<{ issueNumber: number | null }> = [];

      for (const err of errors) {
        const submission = await (prisma as any).feedbackSubmission.create({
          data: {
            projectKey,
            type: "error",
            channel: "error",
            errorMessage: (err.errorMessage as string) ?? null,
            errorType: (err.errorType as string) ?? null,
            stackTrace: (err.stackTrace as string) ?? null,
            source: (err.source as string) ?? null,
            deviceInfo:
              typeof err.deviceInfo === "object"
                ? JSON.stringify(err.deviceInfo)
                : (err.deviceInfo as string) ?? null,
            userId: (err.userId as string) ?? null,
            username: (err.username as string) ?? null,
            currentRoute: (err.currentRoute as string) ?? null,
            appVersion: (err.appVersion as string) ?? null,
            buildNumber: (err.buildNumber as string) ?? null,
          },
        });
        results.push({ issueNumber: submission.githubIssueNumber ?? null });
      }

      return reply.status(201).send({ success: true, results });
    },
  );

  app.post(
    "/v1/feedback/submit-manual",
    { config: { skipAuth: true } } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const projectKey = body.projectKey as string | undefined;
      const title = body.title as string | undefined;
      if (!projectKey || !title) {
        return reply.status(400).send({ error: 'fields "projectKey" and "title" are required' });
      }

      const prisma = getPrisma() as any;
      const config = await prisma.feedbackProjectConfig.findUnique({ where: { projectKey } });
      if (config && config.manualFeedbackEnabled === false) {
        return reply.status(403).send({ error: "manual_feedback_disabled" });
      }

      const shouldQueueGitHubSync = Boolean(
        config?.githubIssueSyncEnabled && config?.githubRepoOwner && config?.githubRepoName && config?.githubToken,
      );
      const requestedAt = shouldQueueGitHubSync ? new Date() : null;

      const submission = await prisma.feedbackSubmission.create({
        data: {
          projectKey,
          type: "manual",
          channel: "manual",
          title,
          description: (body.description as string) ?? null,
          userId: (body.userId as string) ?? null,
          username: (body.username as string) ?? null,
          attachmentsJson: body.attachments ? JSON.stringify(body.attachments) : null,
          metadataJson: body.metadata ? JSON.stringify(body.metadata) : null,
          githubSyncStatus: shouldQueueGitHubSync ? "pending" : "skipped",
          githubSyncRequestedAt: requestedAt,
          status: "pending",
        },
      });

      if (shouldQueueGitHubSync) {
        await prisma.feedbackIssueOutbox.create({
          data: {
            submissionId: submission.id,
            projectKey,
            status: "pending",
          },
        });
      }

      return reply.status(201).send({
        success: true,
        submissionId: submission.id,
        githubSyncQueued: shouldQueueGitHubSync,
      });
    },
  );

  app.get(
    "/v1/admin/feedback/submissions",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as Record<string, string | undefined>;
      const authProjectKey = resolveScopedProjectKey(request);
      const scopeError = ensureScopedProjectKeyMatch(reply, authProjectKey, query.projectKey);
      if (scopeError) {
        return scopeError;
      }

      const projectKey = authProjectKey;
      const prisma = getPrisma() as any;
      const submissions = await prisma.feedbackSubmission.findMany({
        where: { projectKey },
        orderBy: { createdAt: "desc" },
      });

      return reply.status(200).send({ submissions });
    },
  );

  app.get(
    "/v1/admin/feedback/submissions/:id",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as Record<string, string>;
      const authProjectKey = resolveScopedProjectKey(request);
      if (!authProjectKey) {
        return reply.status(403).send({ error: "project_key_missing" });
      }

      const prisma = getPrisma() as any;
      const submission = await prisma.feedbackSubmission.findUnique({
        where: { id: params.id },
      });

      if (!submission || submission.projectKey !== authProjectKey) {
        return reply.status(404).send({ error: "feedback_submission_not_found" });
      }

      return reply.status(200).send({
        ...submission,
        attachments: parseJsonField(submission.attachmentsJson),
        metadata: parseJsonField(submission.metadataJson),
      });
    },
  );

  app.post(
    "/v1/admin/feedback/submissions/:id/retry-github-sync",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as Record<string, string>;
      const authProjectKey = resolveScopedProjectKey(request);
      if (!authProjectKey) {
        return reply.status(403).send({ error: "project_key_missing" });
      }

      const prisma = getPrisma() as any;
      const submission = await prisma.feedbackSubmission.findUnique({
        where: { id: params.id },
      });

      if (!submission || submission.projectKey !== authProjectKey) {
        return reply.status(404).send({ error: "feedback_submission_not_found" });
      }

      const config = await prisma.feedbackProjectConfig.findUnique({
        where: { projectKey: authProjectKey },
      });
      if (!canQueueGitHubSync(config)) {
        return reply.status(409).send({ error: "github_sync_not_configured" });
      }

      await prisma.feedbackSubmission.update({
        where: { id: params.id },
        data: {
          githubSyncStatus: "pending",
          githubSyncError: null,
          githubSyncRequestedAt: new Date(),
        },
      });

      await ensureActiveOutboxJob(prisma, submission.id, submission.projectKey);

      return reply.status(202).send({ accepted: true, submissionId: submission.id });
    },
  );

  app.post(
    "/v1/admin/feedback/process-pending",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = (request.body as Record<string, unknown> | undefined) || {};
      const authProjectKey = resolveScopedProjectKey(request);
      const scopeError = ensureScopedProjectKeyMatch(reply, authProjectKey, body.projectKey as string | undefined);
      if (scopeError) {
        return scopeError;
      }

      const targetProjectKey = authProjectKey;
      const prisma = getPrisma() as any;
      const config = await prisma.feedbackProjectConfig.findUnique({
        where: { projectKey: targetProjectKey },
      });
      if (!canQueueGitHubSync(config)) {
        return reply.status(409).send({ error: "github_sync_not_configured" });
      }

      const submissions = await prisma.feedbackSubmission.findMany({
        where: {
          projectKey: targetProjectKey,
          githubSyncStatus: "pending",
        },
        orderBy: { createdAt: "asc" },
      });

      const requestedAt = new Date();
      for (const submission of submissions) {
        await ensureActiveOutboxJob(prisma, submission.id, submission.projectKey);
        await prisma.feedbackSubmission.update({
          where: { id: submission.id },
          data: {
            githubSyncStatus: "pending",
            githubSyncError: null,
            githubSyncRequestedAt: requestedAt,
          },
        });
      }

      return reply.status(202).send({ accepted: true, queuedCount: submissions.length });
    },
  );

  app.get(
    "/v1/admin/feedback/project-config/:projectKey",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as Record<string, string>;
      const authProjectKey = resolveScopedProjectKey(request);
      const scopeError = ensureScopedProjectKeyMatch(reply, authProjectKey, params.projectKey);
      if (scopeError) {
        return scopeError;
      }

      const scopedProjectKey = authProjectKey;
      const prisma = getPrisma() as any;
      const config = await prisma.feedbackProjectConfig.findUnique({
        where: { projectKey: scopedProjectKey },
      });

      return reply.status(200).send({
        projectKey: scopedProjectKey,
        githubRepoOwner: config?.githubRepoOwner ?? null,
        githubRepoName: config?.githubRepoName ?? null,
        githubIssueSyncEnabled: config?.githubIssueSyncEnabled ?? false,
        manualFeedbackEnabled: config?.manualFeedbackEnabled ?? true,
        errorReportingEnabled: config?.errorReportingEnabled ?? true,
        crashReportingEnabled: config?.crashReportingEnabled ?? true,
        hasGithubToken: Boolean(config?.githubToken),
      });
    },
  );

  app.put(
    "/v1/admin/feedback/project-config/:projectKey",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as Record<string, string>;
      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const authProjectKey = resolveScopedProjectKey(request);
      const scopeError = ensureScopedProjectKeyMatch(reply, authProjectKey, params.projectKey);
      if (scopeError) {
        return scopeError;
      }

      const scopedProjectKey = authProjectKey;
      const prisma = getPrisma() as any;
      const payload = {
        githubRepoOwner: (body.githubRepoOwner as string) ?? null,
        githubRepoName: (body.githubRepoName as string) ?? null,
        githubToken: (body.githubToken as string) ?? null,
        githubIssueSyncEnabled: Boolean(body.githubIssueSyncEnabled),
        manualFeedbackEnabled: body.manualFeedbackEnabled === undefined ? true : Boolean(body.manualFeedbackEnabled),
        errorReportingEnabled: body.errorReportingEnabled === undefined ? true : Boolean(body.errorReportingEnabled),
        crashReportingEnabled: body.crashReportingEnabled === undefined ? true : Boolean(body.crashReportingEnabled),
      };

      await prisma.feedbackProjectConfig.upsert({
        where: { projectKey: scopedProjectKey },
        update: payload,
        create: {
          projectKey: scopedProjectKey,
          ...payload,
        },
      });

      return reply.status(200).send({ success: true, projectKey: scopedProjectKey });
    },
  );
}
