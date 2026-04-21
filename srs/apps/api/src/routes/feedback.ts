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
import { createHash } from "node:crypto";
import { getPrisma } from "../db.js";

// ---------------------------------------------------------------------------
// Normalized fingerprint for error/crash deduplication
// ---------------------------------------------------------------------------

/**
 * Strip dynamic noise from a string so that semantically identical errors
 * produce the same fingerprint across sessions, users and devices.
 *
 * Noise removed:
 *  - timestamps (ISO 8601, Unix ms, relative like "123ms")
 *  - UUID / cuid / hex identifiers (8+ chars)
 *  - device identifiers (device-id, device_id, UDID, IDFA, etc.)
 *  - line/column numbers from stack traces (at <method> file:line:col)
 *  - memory addresses (0x...)
 *  - numeric IDs in angle brackets (e.g. <0.123.0>)
 */
function stripDynamicNoise(raw: string): string {
  let s = raw;
  // Remove ISO 8601 timestamps
  s = s.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, "<ts>");
  // Remove Unix timestamps (10-13 digit numbers standing alone)
  s = s.replace(/\b\d{10,13}\b/g, "<ts>");
  // Remove relative time like 123ms, 45s
  s = s.replace(/\b\d+(?:\.\d+)?(?:ms|s|sec|min)\b/g, "<dur>");
  // Remove UUIDs
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");
  // Remove cuid2 (25+ lowercase alphanumeric starting with a letter)
  s = s.replace(/\b[a-z][a-z0-9]{24,}\b/g, "<id>");
  // Remove long hex sequences (memory addresses, hashes)
  s = s.replace(/0x[0-9a-fA-F]+/g, "<hex>");
  s = s.replace(/\b[0-9a-fA-F]{16,}\b/g, "<hex>");
  // Remove line:col in stack frames (at X /path/file.dart:123:45)
  s = s.replace(/:(\d+)(?::(\d+))?/g, ":<ln>");
  // Remove device identifiers
  s = s.replace(/(?:device[-_]?id|udid|idfa|idfv|android[-_]?id|advertising[-_]?id)[\s:=]+["']?\S+["']?/gi, "<device>");
  // Remove numeric IDs in angle brackets (Erlang-style)
  s = s.replace(/<\d+\.\d+\.\d+>/g, "<pid>");
  return s;
}

/**
 * Build a normalized fingerprint from error/crash fields.
 * Only used for channel=error or channel=crash.
 * Returns SHA-256 hex digest.
 */
export function computeNormalizedFingerprint(input: {
  errorType?: string | null;
  errorMessage?: string | null;
  stackTrace?: string | null;
  source?: string | null;
  currentRoute?: string | null;
}): string {
  const parts: string[] = [];

  if (input.errorType && input.errorType.trim()) {
    parts.push(input.errorType.trim());
  }

  if (input.errorMessage && input.errorMessage.trim()) {
    const stripped = stripDynamicNoise(input.errorMessage.trim());
    // Take first 500 chars after stripping to keep fingerprint stable
    parts.push(stripped.slice(0, 500));
  }

  if (input.stackTrace && input.stackTrace.trim()) {
    // Normalize stack trace: take first 3 meaningful lines after stripping noise
    const lines = input.stackTrace
      .trim()
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(0, 3)
      .map((l) => stripDynamicNoise(l));
    parts.push(lines.join("|"));
  }

  if (input.source && input.source.trim()) {
    const stripped = stripDynamicNoise(input.source.trim());
    parts.push(stripped.slice(0, 200));
  }

  if (input.currentRoute && input.currentRoute.trim()) {
    parts.push(input.currentRoute.trim());
  }

  const raw = parts.join("::");
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Build a human-readable summary for an error/crash issue group.
 * Prefers errorType, then first line of errorMessage, then a fallback.
 */
export function buildNormalizedSummary(input: {
  errorType?: string | null;
  errorMessage?: string | null;
  currentRoute?: string | null;
}): string {
  if (input.errorType && input.errorType.trim()) {
    const prefix = input.currentRoute ? `[${input.currentRoute}] ` : "";
    return `${prefix}${input.errorType.trim()}`;
  }

  if (input.errorMessage && input.errorMessage.trim()) {
    const firstLine = input.errorMessage.trim().split("\n")[0].trim();
    const prefix = input.currentRoute ? `[${input.currentRoute}] ` : "";
    return `${prefix}${firstLine.slice(0, 120)}`;
  }

  if (input.currentRoute) {
    return `Error on ${input.currentRoute}`;
  }

  return "Unknown error";
}

function parseJsonField(value: string | null | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeString(value: unknown) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item));
}

function toJsonOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  if (!Array.isArray(value) && typeof value === "object" && Object.keys(value as Record<string, unknown>).length === 0) {
    return null;
  }
  return JSON.stringify(value);
}

function parseAttachmentList(value: string | null | undefined) {
  const parsed = parseJsonField(value);
  if (!Array.isArray(parsed)) return [] as Array<Record<string, unknown>>;
  return parsed
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function appendNormalizedAttachment(
  attachments: Array<Record<string, unknown>>,
  seenUrls: Set<string>,
  input: Record<string, unknown>,
  fallbackName: string,
  fallbackKind?: string,
) {
  const url = normalizeString(input.url);
  if (!url || seenUrls.has(url)) return;
  seenUrls.add(url);

  const attachment: Record<string, unknown> = {
    url,
    name: normalizeString(input.name) ?? fallbackName,
  };
  const kind = normalizeString(input.kind) ?? fallbackKind ?? null;
  if (kind) attachment.kind = kind;
  attachments.push(attachment);
}

function buildFeedbackAttachments(body: Record<string, unknown>) {
  const attachments: Array<Record<string, unknown>> = [];
  const seenUrls = new Set<string>();

  if (Array.isArray(body.attachments)) {
    for (const item of body.attachments) {
      const attachment = asRecord(item);
      if (!attachment) continue;
      appendNormalizedAttachment(attachments, seenUrls, attachment, "attachment", normalizeString(attachment.kind) ?? undefined);
    }
  }

  const screenshotUrls = normalizeStringArray(body.screenshotUrls);
  const singleScreenshotUrl = normalizeString(body.screenshotUrl);
  if (singleScreenshotUrl) screenshotUrls.unshift(singleScreenshotUrl);
  screenshotUrls.forEach((url, index) => {
    appendNormalizedAttachment(
      attachments,
      seenUrls,
      { url, name: `screenshot-${index + 1}`, kind: "screenshot" },
      `screenshot-${index + 1}`,
      "screenshot",
    );
  });

  const logUrl = normalizeString(body.logUrl) ?? normalizeString(body.logsUrl);
  if (logUrl) {
    appendNormalizedAttachment(
      attachments,
      seenUrls,
      { url: logUrl, name: "logs.txt", kind: "log" },
      "logs.txt",
      "log",
    );
  }

  return attachments;
}

function buildFeedbackMetadata(body: Record<string, unknown>, attachments: Array<Record<string, unknown>>) {
  const metadata = asRecord(body.metadata) ? { ...(body.metadata as Record<string, unknown>) } : {};
  const feedbackType = normalizeString(body.feedbackType);
  if (feedbackType) metadata.feedbackType = feedbackType;
  const occurrenceTime = normalizeString(body.occurrenceTime);
  if (occurrenceTime) metadata.occurrenceTime = occurrenceTime;
  const screenshotUrls = attachments
    .filter((item) => normalizeString(item.kind) === "screenshot")
    .map((item) => normalizeString(item.url))
    .filter((item): item is string => Boolean(item));
  if (screenshotUrls.length > 0) {
    metadata.screenshotUrls = screenshotUrls;
    metadata.screenshotUrl = screenshotUrls[0];
  }
  const logAttachment = attachments.find((item) => normalizeString(item.kind) === "log");
  const logUrl = normalizeString(logAttachment?.url) ?? normalizeString(body.logUrl) ?? normalizeString(body.logsUrl);
  if (logUrl) metadata.logUrl = logUrl;
  return metadata;
}

function parseDeviceInfo(value: unknown) {
  if (!value) return {};
  if (typeof value === "string") {
    const parsed = parseJsonField(value);
    return asRecord(parsed) ?? {};
  }
  return asRecord(value) ?? {};
}

function resolveSubmittedUserName(body: Record<string, unknown>) {
  return normalizeString(body.username) ?? normalizeString(body.userName);
}

function resolveProjectKey(request: FastifyRequest): string | undefined {
  const headerKey = request.headers["x-project-key"];
  if (typeof headerKey === "string" && headerKey.trim().length > 0) {
    return headerKey.trim();
  }
  return undefined;
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

function parseStatusHistory(value: string | null | undefined) {
  const parsed = parseJsonField(value);
  return Array.isArray(parsed) ? parsed : [];
}

function buildStatusHistoryEntry(status: string, detail?: Record<string, unknown>) {
  return {
    status,
    at: new Date().toISOString(),
    ...(detail ?? {}),
  };
}

function appendStatusHistory(value: string | null | undefined, entry: Record<string, unknown>) {
  const history = parseStatusHistory(value);
  return JSON.stringify([...history, entry]);
}

function mapSubmissionStatus(rawStatus: string | null | undefined) {
  if (rawStatus === "fixed") return "fixed";
  if (rawStatus === "closed") return "fixed";
  if (rawStatus === "skipped") return "closed";
  return "open";
}

function mapFeedbackType(submission: any) {
  const metadata = asRecord(parseJsonField(submission.metadataJson));
  const metadataFeedbackType = normalizeString(metadata?.feedbackType);
  if (metadataFeedbackType === "feature") return "feature";
  if (metadataFeedbackType === "bug") return "bug";
  return "bug";
}

function normalizeStatusHistoryEntries(value: string | null | undefined) {
  const parsed = parseStatusHistory(value);
  return parsed.map((entry) => {
    const item = asRecord(entry) ?? {};
    return {
      status: normalizeString(item.status) ?? "open",
      timestamp: normalizeString(item.timestamp) ?? normalizeString(item.at) ?? new Date().toISOString(),
      comment: normalizeString(item.comment) ?? normalizeString(item.feedback) ?? normalizeString(item.version),
    };
  });
}

function toClientSubmissionItem(submission: any) {
  const attachments = parseAttachmentList(submission.attachmentsJson);
  const metadata = asRecord(parseJsonField(submission.metadataJson)) ?? {};
  const screenshotUrls = normalizeStringArray(metadata.screenshotUrls);
  const attachmentScreenshotUrls = attachments
    .filter((item) => normalizeString(item.kind) === "screenshot")
    .map((item) => normalizeString(item.url))
    .filter((item): item is string => Boolean(item));
  const mergedScreenshotUrls = Array.from(new Set([...screenshotUrls, ...attachmentScreenshotUrls]));
  const screenshotUrl = normalizeString(metadata.screenshotUrl) ?? mergedScreenshotUrls[0] ?? null;
  const logUrl = normalizeString(metadata.logUrl)
    ?? normalizeString(
      attachments.find((item) => normalizeString(item.kind) === "log")?.url,
    )
    ?? null;

  return {
    id: submission.id,
    _id: submission.id,
    type: submission.type,
    channel: submission.channel ?? submission.type,
    userId: submission.userId ?? null,
    userName: submission.username ?? null,
    title: submission.title ?? submission.errorMessage ?? null,
    description: submission.description ?? submission.errorMessage ?? null,
    screenshotUrl,
    screenshotUrls: mergedScreenshotUrls,
    logUrl,
    deviceInfo: parseDeviceInfo(submission.deviceInfo),
    feedbackType: mapFeedbackType(submission),
    status: mapSubmissionStatus(submission.status),
    githubIssueNumber: submission.githubIssueNumber ?? null,
    githubIssueUrl: submission.githubIssueUrl ?? null,
    fixVersion: submission.fixedInVersion ?? null,
    fixedAt: submission.fixedAt ?? null,
    fixVerified: submission.fixVerified ?? null,
    verificationFeedback: submission.verificationFeedback ?? null,
    verifiedAt: submission.verifiedAt ?? null,
    statusHistory: normalizeStatusHistoryEntries(submission.statusHistoryJson),
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
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

async function createFeedbackSubmission(
  prisma: any,
  input: {
    projectKey: string;
    type: string;
    channel: string;
    config?: {
      githubIssueSyncEnabled?: boolean;
      githubRepoOwner?: string | null;
      githubRepoName?: string | null;
      githubToken?: string | null;
    } | null;
    queueGitHubSync?: boolean;
    submissionStatus?: string;
    githubSyncStatus?: string;
    data: Record<string, unknown>;
  },
) {
  const githubSyncQueued = input.queueGitHubSync ?? canQueueGitHubSync(input.config);
  const requestedAt = githubSyncQueued ? new Date() : null;
  const submission = await prisma.feedbackSubmission.create({
    data: {
      projectKey: input.projectKey,
      type: input.type,
      channel: input.channel,
      githubSyncStatus: input.githubSyncStatus ?? (githubSyncQueued ? "pending" : "skipped"),
      githubSyncRequestedAt: requestedAt,
      status: input.submissionStatus ?? "pending",
      ...input.data,
    },
  });

  if (githubSyncQueued) {
    await ensureActiveOutboxJob(prisma, submission.id, input.projectKey);
  }

  return {
    submission,
    githubSyncQueued,
  };
}

export async function registerFeedbackRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/feedback/client-settings",
    { config: { skipAuth: true } } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = resolveProjectKey(request);
      if (!projectKey) {
        return reply.status(400).send({ error: 'X-Project-Key header is required' });
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
      const projectKey = resolveProjectKey(request);
      if (!projectKey) {
        return reply.status(400).send({ error: 'X-Project-Key header is required' });
      }

      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const prisma = getPrisma() as any;
      const config = await prisma.feedbackProjectConfig.findUnique({ where: { projectKey } });
      const crashReportingEnabled = config?.crashReportingEnabled !== false;
      const attachments = buildFeedbackAttachments(body);
      const metadata = buildFeedbackMetadata(body, attachments);

      if (!crashReportingEnabled) {
        const { submission } = await createFeedbackSubmission(prisma, {
          projectKey,
          type: "crash",
          channel: "crash",
          config,
          queueGitHubSync: false,
          githubSyncStatus: "skipped",
          submissionStatus: "skipped",
          data: {
            errorMessage: (body.errorMessage as string) ?? null,
            errorType: (body.errorType as string) ?? null,
            stackTrace: (body.stackTrace as string) ?? null,
            source: (body.source as string) ?? null,
            logs: (body.logs as string) ?? null,
            deviceInfo: toJsonOrNull(asRecord(body.deviceInfo)),
            userId: (body.userId as string) ?? null,
            username: resolveSubmittedUserName(body),
            currentRoute: (body.currentRoute as string) ?? null,
            appVersion: (body.appVersion as string) ?? null,
            buildNumber: (body.buildNumber as string) ?? null,
            attachmentsJson: toJsonOrNull(attachments),
            metadataJson: toJsonOrNull(metadata),
          },
        });

        return reply.status(201).send({
          success: true,
          crashId: submission.id,
          githubSyncQueued: false,
          skipped: true,
        });
      }

      // Compute fingerprint for crash dedup
      const runtimeEnv = normalizeString(body.runtimeEnv) ?? "dev";
      const fingerprint = computeNormalizedFingerprint({
        errorType: (body.errorType as string) ?? null,
        errorMessage: (body.errorMessage as string) ?? null,
        stackTrace: (body.stackTrace as string) ?? null,
        source: (body.source as string) ?? null,
        currentRoute: (body.currentRoute as string) ?? null,
      });

      const summary = buildNormalizedSummary({
        errorType: (body.errorType as string) ?? null,
        errorMessage: (body.errorMessage as string) ?? null,
        currentRoute: (body.currentRoute as string) ?? null,
      });

      const existingGroup = await prisma.feedbackIssueGroup.findUnique({
        where: {
          projectKey_runtimeEnv_normalizedFingerprint: {
            projectKey,
            runtimeEnv,
            normalizedFingerprint: fingerprint,
          },
        },
      });

      let groupId: string;
      let groupIssueNumber: number | null = null;
      let groupIssueUrl: string | null = null;

      if (existingGroup) {
        groupId = existingGroup.id;
        groupIssueNumber = existingGroup.githubIssueNumber;
        groupIssueUrl = existingGroup.githubIssueUrl;
        await prisma.feedbackIssueGroup.update({
          where: { id: existingGroup.id },
          data: {
            occurrenceCount: { increment: 1 },
            lastOccurredAt: new Date(),
          },
        });
      } else {
        const newGroup = await prisma.feedbackIssueGroup.create({
          data: {
            projectKey,
            runtimeEnv,
            normalizedFingerprint: fingerprint,
            normalizedSummary: summary,
            occurrenceCount: 1,
          },
        });
        groupId = newGroup.id;
      }

      const shouldQueueGitHub = canQueueGitHubSync(config);
      const effectiveSyncStatus = groupIssueNumber ? "synced" : (shouldQueueGitHub ? "pending" : "skipped");

      const { submission, githubSyncQueued } = await createFeedbackSubmission(prisma, {
        projectKey,
        type: "crash",
        channel: "crash",
        config: shouldQueueGitHub && !groupIssueNumber ? config : null,
        queueGitHubSync: shouldQueueGitHub && !groupIssueNumber,
        githubSyncStatus: effectiveSyncStatus,
        submissionStatus: "pending",
        data: {
          errorMessage: (body.errorMessage as string) ?? null,
          errorType: (body.errorType as string) ?? null,
          stackTrace: (body.stackTrace as string) ?? null,
          source: (body.source as string) ?? null,
          logs: (body.logs as string) ?? null,
          deviceInfo: toJsonOrNull(asRecord(body.deviceInfo)),
          userId: (body.userId as string) ?? null,
          username: resolveSubmittedUserName(body),
          currentRoute: (body.currentRoute as string) ?? null,
          appVersion: (body.appVersion as string) ?? null,
          buildNumber: (body.buildNumber as string) ?? null,
          attachmentsJson: toJsonOrNull(attachments),
          metadataJson: toJsonOrNull(metadata),
          issueGroupId: groupId,
          githubIssueNumber: groupIssueNumber,
          githubIssueUrl: groupIssueUrl,
        },
      });

      await prisma.feedbackIssueGroup.update({
        where: { id: groupId },
        data: { latestSubmissionId: submission.id },
      });

      return reply.status(201).send({
        success: true,
        crashId: submission.id,
        githubSyncQueued,
        skipped: false,
      });
    },
  );

  app.post(
    "/v1/feedback/submit-errors",
    { config: { skipAuth: true } } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = resolveProjectKey(request);
      if (!projectKey) {
        return reply.status(400).send({ error: 'X-Project-Key header is required' });
      }

      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const errors = body.errors as Array<Record<string, unknown>> | undefined;
      if (!errors || !Array.isArray(errors) || errors.length === 0) {
        return reply.status(400).send({ error: 'field "errors" must be a non-empty array' });
      }

      const prisma = getPrisma() as any;
      const config = await prisma.feedbackProjectConfig.findUnique({ where: { projectKey } });
      const errorReportingEnabled = config?.errorReportingEnabled !== false;
      const results: Array<{ issueNumber: number | null; submissionId: string; githubSyncQueued: boolean; skipped: boolean }> = [];

      // Deduplicate within batch by fingerprint
      const runtimeEnv = normalizeString(body.runtimeEnv) ?? "dev";
      const seenFingerprints = new Map<string, string>(); // fingerprint -> submissionId

      for (const err of errors) {
        const errorBody = asRecord(err) ?? {};

        if (!errorReportingEnabled) {
          const { submission } = await createFeedbackSubmission(prisma, {
            projectKey,
            type: "error",
            channel: "error",
            config,
            queueGitHubSync: false,
            githubSyncStatus: "skipped",
            submissionStatus: "skipped",
            data: {
              errorMessage: (errorBody.errorMessage as string) ?? null,
              errorType: (errorBody.errorType as string) ?? null,
              stackTrace: (errorBody.stackTrace as string) ?? null,
              source: (errorBody.source as string) ?? null,
              deviceInfo: toJsonOrNull(asRecord(errorBody.deviceInfo)),
              userId: (errorBody.userId as string) ?? null,
              username: resolveSubmittedUserName(errorBody),
              currentRoute: (errorBody.currentRoute as string) ?? null,
              appVersion: (errorBody.appVersion as string) ?? null,
              buildNumber: (errorBody.buildNumber as string) ?? null,
            },
          });
          results.push({
            issueNumber: null,
            submissionId: submission.id,
            githubSyncQueued: false,
            skipped: true,
          });
          continue;
        }

        // Compute fingerprint for dedup
        const fingerprint = computeNormalizedFingerprint({
          errorType: (errorBody.errorType as string) ?? null,
          errorMessage: (errorBody.errorMessage as string) ?? null,
          stackTrace: (errorBody.stackTrace as string) ?? null,
          source: (errorBody.source as string) ?? null,
          currentRoute: (errorBody.currentRoute as string) ?? null,
        });

        // Check if same fingerprint was already processed in this batch
        const existingSubmissionId = seenFingerprints.get(fingerprint);
        if (existingSubmissionId) {
          // Same root cause within same batch: reuse existing submission's issue info
          results.push({
            issueNumber: null,
            submissionId: existingSubmissionId,
            githubSyncQueued: false,
            skipped: false,
          });
          continue;
        }

        // Find or create issue group
        const summary = buildNormalizedSummary({
          errorType: (errorBody.errorType as string) ?? null,
          errorMessage: (errorBody.errorMessage as string) ?? null,
          currentRoute: (errorBody.currentRoute as string) ?? null,
        });

        const existingGroup = await prisma.feedbackIssueGroup.findUnique({
          where: {
            projectKey_runtimeEnv_normalizedFingerprint: {
              projectKey,
              runtimeEnv,
              normalizedFingerprint: fingerprint,
            },
          },
        });

        let groupId: string;
        let groupIssueNumber: number | null = null;
        let groupIssueUrl: string | null = null;

        if (existingGroup) {
          groupId = existingGroup.id;
          groupIssueNumber = existingGroup.githubIssueNumber;
          groupIssueUrl = existingGroup.githubIssueUrl;
          // Update group stats
          await prisma.feedbackIssueGroup.update({
            where: { id: existingGroup.id },
            data: {
              occurrenceCount: { increment: 1 },
              lastOccurredAt: new Date(),
            },
          });
        } else {
          const newGroup = await prisma.feedbackIssueGroup.create({
            data: {
              projectKey,
              runtimeEnv,
              normalizedFingerprint: fingerprint,
              normalizedSummary: summary,
              occurrenceCount: 1,
            },
          });
          groupId = newGroup.id;
        }

        // Create submission linked to group
        const shouldQueueGitHub = canQueueGitHubSync(config);
        const syncStatus = shouldQueueGitHub ? "pending" : "skipped";

        // If group already has an issue, propagate to submission immediately
        const effectiveSyncStatus = groupIssueNumber ? "synced" : syncStatus;

        const { submission, githubSyncQueued } = await createFeedbackSubmission(prisma, {
          projectKey,
          type: "error",
          channel: "error",
          config: shouldQueueGitHub ? config : null,
          queueGitHubSync: shouldQueueGitHub && !groupIssueNumber,
          githubSyncStatus: effectiveSyncStatus,
          submissionStatus: "pending",
          data: {
            errorMessage: (errorBody.errorMessage as string) ?? null,
            errorType: (errorBody.errorType as string) ?? null,
            stackTrace: (errorBody.stackTrace as string) ?? null,
            source: (errorBody.source as string) ?? null,
            deviceInfo: toJsonOrNull(asRecord(errorBody.deviceInfo)),
            userId: (errorBody.userId as string) ?? null,
            username: resolveSubmittedUserName(errorBody),
            currentRoute: (errorBody.currentRoute as string) ?? null,
            appVersion: (errorBody.appVersion as string) ?? null,
            buildNumber: (errorBody.buildNumber as string) ?? null,
            issueGroupId: groupId,
            githubIssueNumber: groupIssueNumber,
            githubIssueUrl: groupIssueUrl,
          },
        });

        // Update group with latest submission
        if (!existingGroup) {
          await prisma.feedbackIssueGroup.update({
            where: { id: groupId },
            data: { latestSubmissionId: submission.id },
          });
        } else {
          await prisma.feedbackIssueGroup.update({
            where: { id: groupId },
            data: { latestSubmissionId: submission.id },
          });
        }

        seenFingerprints.set(fingerprint, submission.id);

        results.push({
          issueNumber: groupIssueNumber ?? submission.githubIssueNumber ?? null,
          submissionId: submission.id,
          githubSyncQueued,
          skipped: false,
        });
      }

      return reply.status(201).send({ success: true, results });
    },
  );

  app.post(
    "/v1/feedback/submit-manual",
    { config: { skipAuth: true } } as any,
    async (request: FastifyRequest, reply: FastifyReply) => {
      const projectKey = resolveProjectKey(request);
      if (!projectKey) {
        return reply.status(400).send({ error: 'X-Project-Key header is required' });
      }

      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const title = body.title as string | undefined;
      if (!title) {
        return reply.status(400).send({ error: 'field "title" is required' });
      }

      const prisma = getPrisma() as any;
      const config = await prisma.feedbackProjectConfig.findUnique({ where: { projectKey } });
      if (config && config.manualFeedbackEnabled === false) {
        return reply.status(403).send({ error: "manual_feedback_disabled" });
      }
      const attachments = buildFeedbackAttachments(body);
      const metadata = buildFeedbackMetadata(body, attachments);

      const { submission, githubSyncQueued } = await createFeedbackSubmission(prisma, {
        projectKey,
        type: "manual",
        channel: "manual",
        config,
        data: {
          title,
          description: (body.description as string) ?? null,
          userId: (body.userId as string) ?? null,
          username: resolveSubmittedUserName(body),
          attachmentsJson: toJsonOrNull(attachments),
          metadataJson: toJsonOrNull(metadata),
        },
      });

      return reply.status(201).send({
        success: true,
        submissionId: submission.id,
        githubSyncQueued,
      });
    },
  );

  app.get(
    "/v1/feedback/submissions",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as Record<string, string | undefined>;
      const authProjectKey = resolveScopedProjectKey(request);
      if (!authProjectKey) {
        return reply.status(403).send({ error: "project_key_missing" });
      }

      const prisma = getPrisma() as any;
      const requestedType = normalizeString(query.type);
      const where: Record<string, unknown> = {
        projectKey: authProjectKey,
      };
      if (query.userId) where.userId = query.userId;
      if (requestedType === "manual" || requestedType === "crash" || requestedType === "error") {
        where.type = requestedType;
      } else if (!requestedType) {
        where.type = "manual";
      }

      const submissions = await prisma.feedbackSubmission.findMany({
        where,
        orderBy: { createdAt: "desc" },
      });

      let items: Array<Record<string, unknown>> = submissions.map(toClientSubmissionItem);
      if (requestedType === "bug" || requestedType === "feature") {
        items = items.filter((item: Record<string, unknown>) => item.feedbackType === requestedType);
      }

      return reply.status(200).send({
        submissions: items,
      });
    },
  );

  app.post(
    "/v1/feedback/verify-fix",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authProjectKey = resolveScopedProjectKey(request);
      if (!authProjectKey) {
        return reply.status(403).send({ error: "project_key_missing" });
      }

      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const feedbackId = body.feedbackId as string | undefined;
      const verified = body.verified as boolean | undefined;
      const userId = body.userId as string | undefined;
      if (!feedbackId || typeof verified !== "boolean" || !userId) {
        return reply.status(400).send({ error: 'fields "feedbackId", "verified", and "userId" are required' });
      }

      const prisma = getPrisma() as any;
      const submission = await prisma.feedbackSubmission.findUnique({
        where: { id: feedbackId },
      });

      if (!submission || submission.projectKey !== authProjectKey || submission.userId !== userId) {
        return reply.status(404).send({ error: "feedback_submission_not_found" });
      }

      const nextStatus = verified ? "fixed" : "open";
      await prisma.feedbackSubmission.update({
        where: { id: feedbackId },
        data: {
          fixVerified: verified,
          verificationFeedback: (body.feedback as string) ?? null,
          verifiedAt: new Date(),
          appVersion: (body.appVersion as string) ?? submission.appVersion ?? null,
          status: nextStatus,
          statusHistoryJson: appendStatusHistory(
            submission.statusHistoryJson,
            buildStatusHistoryEntry(nextStatus, {
              verified,
              feedback: (body.feedback as string) ?? null,
              comment: (body.feedback as string) ?? null,
            }),
          ),
        },
      });

      return reply.status(200).send({
        success: true,
        feedbackId,
        status: nextStatus,
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

  app.post(
    "/v1/admin/feedback/mark-fixed",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authProjectKey = resolveScopedProjectKey(request);
      if (!authProjectKey) {
        return reply.status(403).send({ error: "project_key_missing" });
      }

      const body = request.body as Record<string, unknown> | undefined;
      if (!body) {
        return reply.status(400).send({ error: "request body is required" });
      }

      const issueNumbers = body.issueNumbers as number[] | undefined;
      const version = body.version as string | undefined;
      if (!Array.isArray(issueNumbers) || issueNumbers.length === 0 || !version) {
        return reply.status(400).send({ error: 'fields "issueNumbers" and "version" are required' });
      }

      const prisma = getPrisma() as any;
      const fixedAt = new Date();
      const submissions = await prisma.feedbackSubmission.findMany({
        where: {
          projectKey: authProjectKey,
          githubIssueNumber: { in: issueNumbers },
        },
      });

      for (const submission of submissions) {
        await prisma.feedbackSubmission.update({
          where: { id: submission.id },
          data: {
            status: "fixed",
            fixedInVersion: version,
            fixedAt,
            statusHistoryJson: appendStatusHistory(
              submission.statusHistoryJson,
              buildStatusHistoryEntry("fixed", {
                version,
                issueNumber: submission.githubIssueNumber ?? null,
              }),
            ),
          },
        });
      }

      return reply.status(200).send({
        success: true,
        updatedCount: submissions.length,
        version,
      });
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
