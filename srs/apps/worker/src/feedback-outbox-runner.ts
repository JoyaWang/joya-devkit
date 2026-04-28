import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Inline copy of stripDynamicNoise / computeNormalizedFingerprint
// (shared-kernel extraction deferred to a follow-up)
// ---------------------------------------------------------------------------

function _stripDynamicNoise(raw: string): string {
  let s = raw;
  s = s.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g, "<ts>");
  s = s.replace(/\b\d{10,13}\b/g, "<ts>");
  s = s.replace(/\b\d+(?:\.\d+)?(?:ms|s|sec|min)\b/g, "<dur>");
  s = s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");
  s = s.replace(/\b[a-z][a-z0-9]{24,}\b/g, "<id>");
  s = s.replace(/0x[0-9a-fA-F]+/g, "<hex>");
  s = s.replace(/\b[0-9a-fA-F]{16,}\b/g, "<hex>");
  // Remove pretty-print clock lines BEFORE line:col to avoid destroying time format
  // Format: "12:34:56.789 (+0:01:23.456)" where the parenthesized part is
  // relative duration (hours:minutes:seconds.millis), NOT another timestamp.
  s = s.replace(/\d{2}:\d{2}:\d{2}\.\d{3}\s+\(\+\d:\d{2}:\d{2}\.\d{3}\)/g, "");
  // Remove line:col in stack frames (at X /path/file.dart:123:45)
  s = s.replace(/:(\d+)(?::(\d+))?/g, ":<ln>");
  // Remove device identifiers
  s = s.replace(/(?:device[-_]?id|udid|idfa|idfv|android[-_]?id|advertising[-_]?id)[\s:=]+["']?\S+["']?/gi, "<device>");
  s = s.replace(/<\d+\.\d+\.\d+>/g, "<pid>");
  s = s.replace(/[┌┐└┘├┤┬┴─┄│╔╗╚╝╟╢═╤╧╫╪╡╞╬┼]+/g, "");
  s = s.replace(/\[CrashReporter\]/gi, "[source]");
  s = s.replace(/\[Global\]/gi, "[source]");
  s = s.replace(/\[CloudImage\]/gi, "[source]");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

function _computeFingerprint(input: {
  errorType?: string | null;
  errorMessage?: string | null;
  stackTrace?: string | null;
}): string {
  const parts: string[] = [];
  if (input.errorType && input.errorType.trim()) {
    parts.push(input.errorType.trim());
  }
  if (input.errorMessage && input.errorMessage.trim()) {
    parts.push(_stripDynamicNoise(input.errorMessage.trim()).slice(0, 500));
  }
  if (input.stackTrace && input.stackTrace.trim()) {
    const lines = input.stackTrace
      .trim().split("\n").map((l) => l.trim()).filter((l) => l.length > 0)
      .slice(0, 3).map((l) => _stripDynamicNoise(l));
    parts.push(lines.join("|"));
  }
  return createHash("sha256").update(parts.join("::")).digest("hex");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedbackOutboxRecord {
  id: string;
  submissionId: string;
  projectKey: string;
  status: string;
  attemptCount: number;
  nextRetryAt: Date | null;
}

interface FeedbackSubmissionRecord {
  id: string;
  projectKey: string;
  type: string;
  channel: string;
  title: string | null;
  description: string | null;
  errorMessage: string | null;
  errorType: string | null;
  stackTrace: string | null;
  userId: string | null;
  username: string | null;
  currentRoute: string | null;
  appVersion: string | null;
  buildNumber: string | null;
  deviceInfo: string | null;
  attachmentsJson: string | null;
  metadataJson: string | null;
  githubSyncStatus?: string | null;
  githubIssueNumber?: number | null;
  githubIssueUrl?: string | null;
  issueGroupId?: string | null;
}

interface FeedbackProjectConfigRecord {
  projectKey: string;
  issueTracker: string;
  githubRepoOwner: string | null;
  githubRepoName: string | null;
  githubToken: string | null;
  cnbRepoNamespace: string | null;
  cnbRepoName: string | null;
  cnbToken: string | null;
  githubIssueSyncEnabled: boolean;
}

interface FeedbackIssueGroupRecord {
  id: string;
  projectKey: string;
  runtimeEnv: string;
  normalizedFingerprint: string;
  normalizedSummary: string;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  occurrenceCount: number;
  latestSubmissionId: string | null;
  status: string;
}

export interface FeedbackOutboxPrisma {
  feedbackIssueOutbox: {
    findMany(args: {
      where: Record<string, unknown>;
      orderBy: { createdAt: "asc" | "desc" };
      take: number;
    }): Promise<FeedbackOutboxRecord[]>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
    updateMany?(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  feedbackSubmission: {
    findUnique(args: { where: { id: string } }): Promise<FeedbackSubmissionRecord | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
  feedbackProjectConfig: {
    findUnique(args: { where: { projectKey: string } }): Promise<FeedbackProjectConfigRecord | null>;
  };
  feedbackIssueGroup: {
    findUnique(args: { where: { id: string } }): Promise<FeedbackIssueGroupRecord | null>;
    update(args: {
      where: { id: string };
      data: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

export interface FeedbackOutboxRunResult {
  scanned: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface RunFeedbackOutboxInput {
  prisma: FeedbackOutboxPrisma;
  now?: () => Date;
  fetchImpl?: typeof fetch;
  maxAttempts?: number;
  batchSize?: number;
}

export interface FeedbackOutboxLoop {
  stop(): void;
}

// ---------------------------------------------------------------------------
// Issue tracker platform abstraction
// ---------------------------------------------------------------------------

interface IssueTrackerConfig {
  createIssueUrl: string;
  authHeader: string;
  extraHeaders: Record<string, string>;
  parseResponse: (json: unknown) => { number: number | null; html_url: string | null };
}

function parseIssueNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

function buildIssueTracker(config: FeedbackProjectConfigRecord): IssueTrackerConfig {
  if (config.issueTracker === "cnb") {
    return {
      createIssueUrl: `https://api.cnb.cool/${config.cnbRepoNamespace}/${config.cnbRepoName}/-/issues`,
      authHeader: `Bearer ${config.cnbToken}`,
      extraHeaders: { Accept: "application/vnd.cnb.api+json" },
      parseResponse: (json: any) => {
        const number = parseIssueNumber(json.number);
        return {
          number,
          html_url: json.html_url ?? (number ? `https://cnb.cool/${config.cnbRepoNamespace}/${config.cnbRepoName}/-/issues/${number}` : null),
        };
      },
    };
  }
  // Default: GitHub
  return {
    createIssueUrl: `https://api.github.com/repos/${config.githubRepoOwner}/${config.githubRepoName}/issues`,
    authHeader: `Bearer ${config.githubToken}`,
    extraHeaders: { Accept: "application/vnd.github+json" },
    parseResponse: (json: any) => ({
      number: parseIssueNumber(json.number),
      html_url: json.html_url ?? null,
    }),
  };
}

function validateTrackerConfig(config: FeedbackProjectConfigRecord): string | null {
  if (config.issueTracker === "cnb") {
    if (!config.cnbRepoNamespace || !config.cnbRepoName || !config.cnbToken) {
      return "missing_cnb_config";
    }
    return null;
  }
  if (!config.githubRepoOwner || !config.githubRepoName || !config.githubToken) {
    return "missing_github_config";
  }
  return null;
}

function parseJsonField(value: string | null | undefined): unknown {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildIssueBody(submission: FeedbackSubmissionRecord): string {
  const lines = [
    `## Channel`,
    submission.channel,
    "",
    `## Type`,
    submission.type,
    "",
  ];

  if (submission.description) {
    lines.push("## Description", submission.description, "");
  }
  if (submission.errorMessage) {
    lines.push("## Error Message", submission.errorMessage, "");
  }
  if (submission.errorType) {
    lines.push("## Error Type", submission.errorType, "");
  }
  if (submission.stackTrace) {
    lines.push("## Stack Trace", "```", submission.stackTrace, "```", "");
  }

  const metadata = {
    userId: submission.userId,
    username: submission.username,
    currentRoute: submission.currentRoute,
    appVersion: submission.appVersion,
    buildNumber: submission.buildNumber,
    deviceInfo: parseJsonField(submission.deviceInfo),
    attachments: parseJsonField(submission.attachmentsJson),
    metadata: parseJsonField(submission.metadataJson),
  };

  lines.push("## Metadata", "```json", JSON.stringify(metadata, null, 2), "```");
  return lines.join("\n");
}

function buildIssueTitle(
  submission: FeedbackSubmissionRecord,
  group?: FeedbackIssueGroupRecord | null,
): string {
  // For error/crash with a group, use the group's normalized summary
  if (group?.normalizedSummary) {
    return `[${submission.projectKey}] ${group.normalizedSummary}`;
  }
  if (submission.title && submission.title.trim()) {
    return `[${submission.projectKey}] ${submission.title.trim()}`;
  }
  if (submission.errorMessage && submission.errorMessage.trim()) {
    return `[${submission.projectKey}] ${submission.errorMessage.trim().slice(0, 80)}`;
  }
  return `[${submission.projectKey}] feedback submission ${submission.id}`;
}

function computeNextRetryAt(attemptCount: number, now: Date): Date {
  const delayMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, attemptCount)));
  return new Date(now.getTime() + delayMinutes * 60_000);
}

async function claimOutboxJob(prisma: FeedbackOutboxPrisma, job: FeedbackOutboxRecord, startedAt: Date) {
  if (prisma.feedbackIssueOutbox.updateMany) {
    const claimed = await prisma.feedbackIssueOutbox.updateMany({
      where: {
        id: job.id,
        status: "pending",
      },
      data: {
        status: "processing",
        lastError: null,
        nextRetryAt: null,
        updatedAt: startedAt,
      },
    });
    return claimed.count > 0;
  }

  await prisma.feedbackIssueOutbox.update({
    where: { id: job.id },
    data: {
      status: "processing",
      lastError: null,
      nextRetryAt: null,
      updatedAt: startedAt,
    },
  });
  return true;
}

export async function runFeedbackOutbox(
  input: RunFeedbackOutboxInput,
): Promise<FeedbackOutboxRunResult> {
  const now = input.now ?? (() => new Date());
  const fetchImpl = input.fetchImpl ?? fetch;
  const maxAttempts = input.maxAttempts ?? 5;
  const batchSize = input.batchSize ?? 20;
  const startedAt = now();

  const jobs = await input.prisma.feedbackIssueOutbox.findMany({
    where: {
      status: "pending",
      OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: startedAt } }],
    },
    orderBy: { createdAt: "asc" },
    take: batchSize,
  });

  const result: FeedbackOutboxRunResult = {
    scanned: jobs.length,
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };

  for (const job of jobs) {
    const claimed = await claimOutboxJob(input.prisma, job, startedAt);
    if (!claimed) {
      result.skipped += 1;
      continue;
    }

    result.processed += 1;

    const submission = await input.prisma.feedbackSubmission.findUnique({
      where: { id: job.submissionId },
    });
    if (!submission) {
      result.skipped += 1;
      await input.prisma.feedbackIssueOutbox.update({
        where: { id: job.id },
        data: {
          status: "failed",
          lastError: "submission_not_found",
          attemptCount: job.attemptCount + 1,
        },
      });
      continue;
    }

    if (submission.githubSyncStatus === "synced" || submission.githubIssueNumber || submission.githubIssueUrl) {
      result.skipped += 1;
      await input.prisma.feedbackIssueOutbox.update({
        where: { id: job.id },
        data: {
          status: "completed",
          attemptCount: job.attemptCount,
          lastError: null,
          nextRetryAt: null,
        },
      });
      if (submission.githubSyncStatus !== "synced") {
        await input.prisma.feedbackSubmission.update({
          where: { id: submission.id },
          data: {
            githubSyncStatus: "synced",
            githubSyncError: null,
          },
        });
      }
      continue;
    }

    const activeSiblingJobs = await input.prisma.feedbackIssueOutbox.findMany({
      where: {
        submissionId: job.submissionId,
        status: "processing",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    const hasAnotherProcessingJob = activeSiblingJobs.some((activeJob) => activeJob.id !== job.id);
    if (hasAnotherProcessingJob) {
      result.skipped += 1;
      await input.prisma.feedbackIssueOutbox.update({
        where: { id: job.id },
        data: {
          status: "pending",
          lastError: "duplicate_active_job",
          nextRetryAt: computeNextRetryAt(job.attemptCount, startedAt),
        },
      });
      continue;
    }

    const config = await input.prisma.feedbackProjectConfig.findUnique({
      where: { projectKey: submission.projectKey },
    });
    if (!config || !config.githubIssueSyncEnabled) {
      result.skipped += 1;
      await input.prisma.feedbackIssueOutbox.update({
        where: { id: job.id },
        data: {
          status: "skipped",
          lastError: "github_sync_disabled",
        },
      });
      await input.prisma.feedbackSubmission.update({
        where: { id: submission.id },
        data: {
          githubSyncStatus: "skipped",
          githubSyncError: "github_sync_disabled",
        },
      });
      continue;
    }

    const trackerConfigError = validateTrackerConfig(config);
    if (trackerConfigError) {
      result.failed += 1;
      const errorMessage = trackerConfigError;
      const nextAttemptCount = job.attemptCount + 1;
      const finalFailure = nextAttemptCount >= maxAttempts;
      await input.prisma.feedbackIssueOutbox.update({
        where: { id: job.id },
        data: {
          status: finalFailure ? "failed" : "pending",
          attemptCount: nextAttemptCount,
          lastError: errorMessage,
          nextRetryAt: finalFailure ? null : computeNextRetryAt(nextAttemptCount, startedAt),
        },
      });
      await input.prisma.feedbackSubmission.update({
        where: { id: submission.id },
        data: {
          githubSyncStatus: finalFailure ? "failed" : "pending",
          githubSyncAttempts: nextAttemptCount,
          githubSyncError: errorMessage,
          githubSyncRequestedAt: startedAt,
        },
      });
      continue;
    }

    try {
      // Phase 2: Fallback — if submission has no issueGroupId, compute fingerprint
      // from submission fields and try to find / create a group so the issue can be reused.
      if (!submission.issueGroupId && (submission.type === "error" || submission.type === "crash")) {
        const fingerprint = _computeFingerprint({
          errorType: submission.errorType,
          errorMessage: submission.errorMessage,
          stackTrace: submission.stackTrace,
        });
        // Search groups by projectKey + fingerprint (runtimeEnv unknown for old submissions)
        const groups = await (input.prisma as any).feedbackIssueGroup.findMany({
          where: {
            projectKey: submission.projectKey,
            normalizedFingerprint: fingerprint,
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        });
        if (groups.length > 0) {
          // Backfill: link submission to existing group
          const existingGroup = groups[0] as FeedbackIssueGroupRecord;
          await (input.prisma as any).feedbackSubmission.update({
            where: { id: submission.id },
            data: { issueGroupId: existingGroup.id },
          });
          // Reload submission with backfilled group id
          submission.issueGroupId = existingGroup.id;
          // Update group occurrence count
          await input.prisma.feedbackIssueGroup.update({
            where: { id: existingGroup.id },
            data: {
              occurrenceCount: { increment: 1 },
              lastOccurredAt: new Date(),
              latestSubmissionId: submission.id,
            },
          });
        }
      }

      // Check if submission belongs to a group that already has a GitHub issue
      let group: FeedbackIssueGroupRecord | null = null;
      if (submission.issueGroupId) {
        group = await input.prisma.feedbackIssueGroup.findUnique({
          where: { id: submission.issueGroupId },
        });
      }

      // If group already has a GitHub issue, reuse it - do NOT create a new one
      if (group?.githubIssueNumber && group?.githubIssueUrl) {
        await input.prisma.feedbackIssueOutbox.update({
          where: { id: job.id },
          data: {
            status: "completed",
            attemptCount: job.attemptCount + 1,
            lastError: null,
            nextRetryAt: null,
          },
        });
        await input.prisma.feedbackSubmission.update({
          where: { id: submission.id },
          data: {
            githubIssueNumber: group.githubIssueNumber,
            githubIssueUrl: group.githubIssueUrl,
            githubSyncStatus: "synced",
            githubSyncAttempts: job.attemptCount + 1,
            githubSyncError: null,
            githubSyncRequestedAt: startedAt,
            githubSyncedAt: startedAt,
            status: "reported",
          },
        });
        result.succeeded += 1;
        continue;
      }

      // No existing issue on group - create one
      const tracker = buildIssueTracker(config);
      const response = await fetchImpl(tracker.createIssueUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...tracker.extraHeaders,
          Authorization: tracker.authHeader,
          "User-Agent": "shared-runtime-services-feedback-worker",
        },
        body: JSON.stringify({
          title: buildIssueTitle(submission, group),
          body: buildIssueBody(submission),
          labels: ["feedback", `project:${submission.projectKey}`, `channel:${submission.channel}`],
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`${config.issueTracker}_issue_create_failed:${response.status}:${text.slice(0, 300)}`);
      }

      const issue = tracker.parseResponse(await response.json());
      const issueNumber = issue.number ?? null;
      const issueUrl = issue.html_url ?? null;

      // Write issue back to group so subsequent submissions reuse it
      if (group && issueNumber && issueUrl) {
        await input.prisma.feedbackIssueGroup.update({
          where: { id: group.id },
          data: {
            githubIssueNumber: issueNumber,
            githubIssueUrl: issueUrl,
          },
        });
      } else if (!group && issueNumber && issueUrl && (submission.type === "error" || submission.type === "crash")) {
        // No group existed before — create one so future submissions reuse this issue
        const fingerprint = _computeFingerprint({
          errorType: submission.errorType,
          errorMessage: submission.errorMessage,
          stackTrace: submission.stackTrace,
        });
        const summary = submission.errorType
          ? `${submission.errorType}`
          : (submission.errorMessage?.slice(0, 120) ?? "Unknown error");
        const newGroup = await (input.prisma as any).feedbackIssueGroup.create({
          data: {
            projectKey: submission.projectKey,
            runtimeEnv: "unknown",
            normalizedFingerprint: fingerprint,
            normalizedSummary: summary,
            githubIssueNumber: issueNumber,
            githubIssueUrl: issueUrl,
            occurrenceCount: 1,
            latestSubmissionId: submission.id,
          },
        });
        // Backfill issueGroupId on submission
        await (input.prisma as any).feedbackSubmission.update({
          where: { id: submission.id },
          data: { issueGroupId: newGroup.id },
        });
      }

      await input.prisma.feedbackIssueOutbox.update({
        where: { id: job.id },
        data: {
          status: "completed",
          attemptCount: job.attemptCount + 1,
          lastError: null,
          nextRetryAt: null,
        },
      });
      await input.prisma.feedbackSubmission.update({
        where: { id: submission.id },
        data: {
          githubIssueNumber: issueNumber,
          githubIssueUrl: issueUrl,
          githubSyncStatus: "synced",
          githubSyncAttempts: job.attemptCount + 1,
          githubSyncError: null,
          githubSyncRequestedAt: startedAt,
          githubSyncedAt: startedAt,
          status: "reported",
        },
      });
      result.succeeded += 1;
    } catch (error) {
      result.failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      const nextAttemptCount = job.attemptCount + 1;
      const finalFailure = nextAttemptCount >= maxAttempts;
      await input.prisma.feedbackIssueOutbox.update({
        where: { id: job.id },
        data: {
          status: finalFailure ? "failed" : "pending",
          attemptCount: nextAttemptCount,
          lastError: message,
          nextRetryAt: finalFailure ? null : computeNextRetryAt(nextAttemptCount, startedAt),
        },
      });
      await input.prisma.feedbackSubmission.update({
        where: { id: submission.id },
        data: {
          githubSyncStatus: finalFailure ? "failed" : "pending",
          githubSyncAttempts: nextAttemptCount,
          githubSyncError: message,
          githubSyncRequestedAt: startedAt,
        },
      });
    }
  }

  return result;
}

export function startFeedbackOutboxLoop(input: {
  intervalMs: number;
  runOutbox?: () => Promise<void>;
  onError?: (error: unknown) => void;
}): FeedbackOutboxLoop {
  const runOutbox = input.runOutbox ?? (async () => {});
  const onError = input.onError ?? ((error) => console.error("[worker] feedback outbox failed", error));

  let stopped = false;
  let inFlight = false;

  const tick = async () => {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;
    try {
      await runOutbox();
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
