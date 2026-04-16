/**
 * Feedback Service routes.
 *
 * GET  /v1/feedback/client-settings — get client-side reporting switches
 * POST /v1/feedback/submit-crash    — submit a crash report (gzip)
 * POST /v1/feedback/submit-errors   — submit a batch of error reports (gzip)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getPrisma } from "../db.js";

// --- Client Settings ---

export async function registerFeedbackRoutes(app: FastifyInstance): Promise<void> {

  // GET /v1/feedback/client-settings
  app.get(
    "/v1/feedback/client-settings",
    { config: { skipAuth: true } } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as Record<string, string | undefined>;
      const projectKey = query.projectKey;
      if (!projectKey) {
        return reply.status(400).send({ error: "query param \"projectKey\" is required" });
      }

      const prisma = getPrisma();
      const settings = await prisma.feedbackClientSettings.findUnique({
        where: { projectKey },
      });

      return reply.status(200).send({
        errorReportingEnabled: settings?.errorReportingEnabled ?? true,
        crashReportingEnabled: settings?.crashReportingEnabled ?? true,
      });
    },
  );

  // POST /v1/feedback/submit-crash
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
        return reply.status(400).send({ error: "field \"projectKey\" is required" });
      }

      const prisma = getPrisma();
      const submission = await prisma.feedbackSubmission.create({
        data: {
          projectKey,
          type: "crash",
          errorMessage: (body.errorMessage as string) ?? null,
          errorType: (body.errorType as string) ?? null,
          stackTrace: (body.stackTrace as string) ?? null,
          source: (body.source as string) ?? null,
          logs: (body.logs as string) ?? null,
          deviceInfo: typeof body.deviceInfo === "object" ? JSON.stringify(body.deviceInfo) : (body.deviceInfo as string) ?? null,
          userId: (body.userId as string) ?? null,
          username: (body.username as string) ?? null,
          currentRoute: (body.currentRoute as string) ?? null,
          appVersion: (body.appVersion as string) ?? null,
          buildNumber: (body.buildNumber as string) ?? null,
        },
      });

      return reply.status(201).send({
        success: true,
        crashId: submission.id,
      });
    },
  );

  // POST /v1/feedback/submit-errors
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
        return reply.status(400).send({ error: "field \"projectKey\" is required" });
      }

      const errors = body.errors as Array<Record<string, unknown>> | undefined;
      if (!errors || !Array.isArray(errors) || errors.length === 0) {
        return reply.status(400).send({ error: "field \"errors\" must be a non-empty array" });
      }

      const prisma = getPrisma();
      const results: Array<{ issueNumber: number | null }> = [];

      for (const err of errors) {
        const submission = await prisma.feedbackSubmission.create({
          data: {
            projectKey,
            type: "error",
            errorMessage: (err.errorMessage as string) ?? null,
            errorType: (err.errorType as string) ?? null,
            stackTrace: (err.stackTrace as string) ?? null,
            source: (err.source as string) ?? null,
            deviceInfo: typeof err.deviceInfo === "object" ? JSON.stringify(err.deviceInfo) : (err.deviceInfo as string) ?? null,
            userId: (err.userId as string) ?? null,
            username: (err.username as string) ?? null,
            currentRoute: (err.currentRoute as string) ?? null,
            appVersion: (err.appVersion as string) ?? null,
            buildNumber: (err.buildNumber as string) ?? null,
          },
        });
        results.push({ issueNumber: submission.githubIssueNumber });
      }

      return reply.status(201).send({
        success: true,
        results,
      });
    },
  );
}
