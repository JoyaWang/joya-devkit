import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const schemaPath = join(__dirname, "../prisma/schema.prisma");

const mockPrisma = {
  feedbackSubmission: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  feedbackProjectConfig: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  },
  feedbackClientSettings: {
    findUnique: vi.fn(),
  },
  feedbackIssueOutbox: {
    create: vi.fn(),
    findMany: vi.fn(),
    update: vi.fn(),
  },
  feedbackIssueGroup: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("../apps/api/src/db.js", () => ({
  getPrisma: () => mockPrisma,
}));

import { registerFeedbackRoutes, computeNormalizedFingerprint, buildNormalizedSummary } from "../apps/api/src/routes/feedback.js";
import { startFeedbackOutboxLoop } from "../apps/worker/src/bootstrap.js";
import { runFeedbackOutbox } from "../apps/worker/src/feedback-outbox-runner.js";

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
    get: vi.fn((path: string, _opts: any, fn?: any) => {
      handlers.set(`GET ${path}`, typeof fn === "function" ? fn : _opts);
    }),
    post: vi.fn((path: string, _opts: any, fn?: any) => {
      handlers.set(`POST ${path}`, typeof fn === "function" ? fn : _opts);
    }),
    put: vi.fn((path: string, _opts: any, fn?: any) => {
      handlers.set(`PUT ${path}`, typeof fn === "function" ? fn : _opts);
    }),
  };

  await register(app);
  return handlers;
}

describe("feedback minimal closure schema", () => {
  it("defines feedback project config and outbox models in prisma schema", () => {
    const schema = readFileSync(schemaPath, "utf8");

    expect(schema).toContain("model FeedbackProjectConfig {");
    expect(schema).toContain("@@map(\"feedback_project_configs\")");
    expect(schema).toMatch(/manualFeedbackEnabled\s+Boolean\s+@default\(true\)\s+@map\(\"manual_feedback_enabled\"\)/);
    expect(schema).toMatch(/githubIssueSyncEnabled\s+Boolean\s+@default\(false\)\s+@map\(\"github_issue_sync_enabled\"\)/);
    expect(schema).toMatch(/githubRepoOwner\s+String\?\s+@map\(\"github_repo_owner\"\)/);
    expect(schema).toMatch(/githubRepoName\s+String\?\s+@map\(\"github_repo_name\"\)/);
    expect(schema).toMatch(/githubToken\s+String\?\s+@map\(\"github_token\"\)/);

    expect(schema).toContain("model FeedbackIssueOutbox {");
    expect(schema).toContain("@@map(\"feedback_issue_outbox\")");
    expect(schema).toMatch(/submissionId\s+String\s+@map\(\"submission_id\"\)/);
    expect(schema).toMatch(/status\s+String\s+@default\(\"pending\"\)/);
    expect(schema).toMatch(/attemptCount\s+Int\s+@default\(0\)\s+@map\(\"attempt_count\"\)/);
    expect(schema).toMatch(/nextRetryAt\s+DateTime\?\s+@map\(\"next_retry_at\"\)/);

    expect(schema).toMatch(/channel\s+String\s+@default\(\"manual\"\)/);
    expect(schema).toMatch(/title\s+String\?/);
    expect(schema).toMatch(/description\s+String\?/);
    expect(schema).toMatch(/attachmentsJson\s+String\?\s+@map\(\"attachments_json\"\)/);
    expect(schema).toMatch(/metadataJson\s+String\?\s+@map\(\"metadata_json\"\)/);
    expect(schema).toMatch(/githubSyncStatus\s+String\s+@default\(\"pending\"\)\s+@map\(\"github_sync_status\"\)/);
    expect(schema).toMatch(/fixedInVersion\s+String\?\s+@map\(\"fixed_in_version\"\)/);
    expect(schema).toMatch(/fixedAt\s+DateTime\?\s+@map\(\"fixed_at\"\)/);
    expect(schema).toMatch(/fixVerified\s+Boolean\?\s+@map\(\"fix_verified\"\)/);
    expect(schema).toMatch(/verificationFeedback\s+String\?\s+@map\(\"verification_feedback\"\)/);
    expect(schema).toMatch(/verifiedAt\s+DateTime\?\s+@map\(\"verified_at\"\)/);
    expect(schema).toMatch(/statusHistoryJson\s+String\?\s+@map\(\"status_history_json\"\)/);
    expect(schema).toContain("model FeedbackIssueGroup {");
    expect(schema).toMatch(/runtimeEnv\s+String\s+@map\("runtime_env"\)/);
    expect(schema).toMatch(/normalizedFingerprint\s+String\s+@map\("normalized_fingerprint"\)/);
    expect(schema).toMatch(/normalizedSummary\s+String\s+@map\("normalized_summary"\)/);
    expect(schema).toMatch(/githubIssueNumber\s+Int\?\s+@map\("github_issue_number"\)/);
    expect(schema).toMatch(/occurrenceCount\s+Int\s+@default\(1\)\s+@map\("occurrence_count"\)/);
    expect(schema).toMatch(/lastOccurredAt\s+DateTime\s+@default\(now\(\)\)\s+@map\("last_occurred_at"\)/);
    expect(schema).toMatch(/@@unique\(\[projectKey, runtimeEnv, normalizedFingerprint\]\)/);
    expect(schema).toContain("@@map(\"feedback_issue_groups\")");
  });
});

describe("feedback dedup helpers", () => {
  it("normalizes dynamic noise into stable fingerprints", () => {
    const first = computeNormalizedFingerprint({
      errorType: "SocketException",
      errorMessage: "socket timeout at 2026-04-21T10:00:00Z device-id=abc123",
      stackTrace: "at Foo /app/file.dart:12:34\nat Bar /app/file.dart:56:78",
      currentRoute: "/home",
    });
    const second = computeNormalizedFingerprint({
      errorType: "SocketException",
      errorMessage: "socket timeout at 2026-04-21T10:01:59Z device-id=xyz789",
      stackTrace: "at Foo /app/file.dart:99:88\nat Bar /app/file.dart:77:66",
      currentRoute: "/home",
    });

    expect(first).toBe(second);
  });

  it("produces same fingerprint for same root cause on different routes", () => {
    const routeA = computeNormalizedFingerprint({
      errorType: "HttpException",
      errorMessage: "Invalid statusCode: 400",
      stackTrace: "at CloudImage /app/widgets/cloud_image.dart:12:34",
      currentRoute: "/home",
      source: "FlutterError",
    });
    const routeB = computeNormalizedFingerprint({
      errorType: "HttpException",
      errorMessage: "Invalid statusCode: 400",
      stackTrace: "at CloudImage /app/widgets/cloud_image.dart:12:34",
      currentRoute: "/profile",
      source: "runZonedGuarded",
    });
    // source and currentRoute must NOT affect fingerprint
    expect(routeA).toBe(routeB);
  });

  it("strips pretty-print noise from error messages", () => {
    const withNoise = computeNormalizedFingerprint({
      errorType: "HttpException",
      errorMessage: "┌─────────────────────┐\n│ Invalid statusCode: 400 │\n└─────────────────────┘\n12:34:56.789 (+0:01:23.456)",
      stackTrace: "at CloudImage /app/widgets/cloud_image.dart:12:34",
    });
    const clean = computeNormalizedFingerprint({
      errorType: "HttpException",
      errorMessage: "Invalid statusCode: 400",
      stackTrace: "at CloudImage /app/widgets/cloud_image.dart:12:34",
    });
    expect(withNoise).toBe(clean);
  });

  it("builds readable normalized summary from route and error type", () => {
    expect(
      buildNormalizedSummary({
        errorType: "SocketException",
        errorMessage: "socket timeout",
        currentRoute: "/home",
      }),
    ).toBe("[/home] SocketException");
  });
});

describe("feedback minimal closure routes", () => {
  let handlers: Map<string, any>;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockPrisma.feedbackSubmission.create.mockResolvedValue({
      id: "fb_001",
      projectKey: "laicai",
      type: "manual",
      channel: "manual",
      status: "pending",
      githubSyncStatus: "pending",
    });
    mockPrisma.feedbackSubmission.findMany.mockResolvedValue([]);
    mockPrisma.feedbackSubmission.findUnique.mockResolvedValue(null);
    mockPrisma.feedbackSubmission.update.mockResolvedValue(undefined);
    mockPrisma.feedbackSubmission.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.feedbackProjectConfig.findUnique.mockResolvedValue({
      projectKey: "laicai",
      manualFeedbackEnabled: true,
      githubIssueSyncEnabled: true,
      githubRepoOwner: "joya",
      githubRepoName: "laicai",
      githubToken: "ghs_test_token",
      errorReportingEnabled: true,
      crashReportingEnabled: true,
    });
    mockPrisma.feedbackProjectConfig.upsert.mockResolvedValue(undefined);
    mockPrisma.feedbackIssueOutbox.create.mockResolvedValue({ id: "outbox_001" });
    mockPrisma.feedbackIssueOutbox.findMany.mockResolvedValue([]);
    mockPrisma.feedbackIssueOutbox.update.mockResolvedValue(undefined);
    mockPrisma.feedbackIssueGroup.findUnique.mockResolvedValue(null);
    mockPrisma.feedbackIssueGroup.create.mockResolvedValue({
      id: "group_001",
      projectKey: "laicai",
      runtimeEnv: "dev",
      normalizedFingerprint: "fingerprint_001",
      normalizedSummary: "[/home] SocketException",
      githubIssueNumber: null,
      githubIssueUrl: null,
      occurrenceCount: 1,
      latestSubmissionId: null,
      status: "open",
    });
    mockPrisma.feedbackIssueGroup.update.mockResolvedValue(undefined);
    handlers = await captureRoutes(registerFeedbackRoutes);
  });

  it("reads client settings from new config and legacy fallback", async () => {
    const handler = handlers.get("GET /v1/feedback/client-settings");
    const reply = makeReply();

    mockPrisma.feedbackProjectConfig.findUnique.mockResolvedValueOnce(null);
    mockPrisma.feedbackClientSettings.findUnique.mockResolvedValueOnce({
      projectKey: "laicai",
      errorReportingEnabled: false,
      crashReportingEnabled: true,
    });

    await handler(
      {
        headers: { "x-project-key": "laicai" },
        query: { projectKey: "laicai" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(reply.payload).toEqual({
      errorReportingEnabled: false,
      crashReportingEnabled: true,
      manualFeedbackEnabled: true,
    });
  });

  it("creates manual feedback submission and corresponding outbox record", async () => {
    const handler = handlers.get("POST /v1/feedback/submit-manual");
    const reply = makeReply();

    await handler(
      {
        headers: { "x-project-key": "laicai" },
        body: {
          projectKey: "laicai",
          title: "无法上传头像",
          description: "点击保存后没有反应",
          userId: "user_001",
          username: "joya",
          attachments: [{ name: "a.png", url: "https://example.com/a.png" }],
          metadata: { route: "/profile" },
          deviceInfo: {
            platform: "iOS",
            os: "iOS",
            osVersion: "17.5",
            model: "iPhone 15 Pro",
            isPhysicalDevice: true,
          },
          currentRoute: "/profile",
          appVersion: "1.0.3",
          buildNumber: "41",
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(201);
    expect(mockPrisma.feedbackSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectKey: "laicai",
        type: "manual",
        channel: "manual",
        title: "无法上传头像",
        description: "点击保存后没有反应",
        attachmentsJson: JSON.stringify([{ url: "https://example.com/a.png", name: "a.png" }]),
        metadataJson: JSON.stringify({ route: "/profile" }),
        deviceInfo: JSON.stringify({
          platform: "iOS",
          os: "iOS",
          osVersion: "17.5",
          model: "iPhone 15 Pro",
          isPhysicalDevice: true,
        }),
        githubSyncStatus: "pending",
        userId: "user_001",
        username: "joya",
        currentRoute: "/profile",
        appVersion: "1.0.3",
        buildNumber: "41",
      }),
    });
    expect(mockPrisma.feedbackIssueOutbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        submissionId: "fb_001",
        projectKey: "laicai",
        status: "pending",
      }),
    });
  });

  it("rejects manual feedback when project config disables it", async () => {
    const handler = handlers.get("POST /v1/feedback/submit-manual");
    const reply = makeReply();
    mockPrisma.feedbackProjectConfig.findUnique.mockResolvedValueOnce({
      projectKey: "laicai",
      manualFeedbackEnabled: false,
      githubIssueSyncEnabled: false,
      githubRepoOwner: null,
      githubRepoName: null,
      githubToken: null,
      errorReportingEnabled: true,
      crashReportingEnabled: true,
    });

    await handler(
      {
        headers: { "x-project-key": "laicai" },
        body: {
          projectKey: "laicai",
          title: "按钮没反应",
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(403);
    expect(reply.payload).toEqual({ error: "manual_feedback_disabled" });
    expect(mockPrisma.feedbackSubmission.create).not.toHaveBeenCalled();
  });

  it("creates manual feedback submission without queue when github sync is disabled", async () => {
    const handler = handlers.get("POST /v1/feedback/submit-manual");
    const reply = makeReply();
    mockPrisma.feedbackProjectConfig.findUnique.mockResolvedValue({
      projectKey: "laicai",
      manualFeedbackEnabled: true,
      githubIssueSyncEnabled: false,
      githubRepoOwner: "joya",
      githubRepoName: "laicai",
      githubToken: null,
      errorReportingEnabled: true,
      crashReportingEnabled: true,
    });

    await handler(
      {
        headers: { "x-project-key": "laicai" },
        body: {
          projectKey: "laicai",
          title: "按钮没反应",
          description: "点击提交没有任何提示",
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(201);
    expect(reply.payload).toEqual({
      success: true,
      submissionId: "fb_001",
      githubSyncQueued: false,
    });
    expect(mockPrisma.feedbackSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectKey: "laicai",
        title: "按钮没反应",
        githubSyncStatus: "skipped",
        githubSyncRequestedAt: null,
      }),
    });
    expect(mockPrisma.feedbackIssueOutbox.create).not.toHaveBeenCalled();
  });

  it("queues crash submission for github sync when project config allows it", async () => {
    const handler = handlers.get("POST /v1/feedback/submit-crash");
    const reply = makeReply();

    await handler(
      {
        headers: { "x-project-key": "laicai" },
        body: {
          projectKey: "laicai",
          errorMessage: "app crashed",
          errorType: "StateError",
          stackTrace: "trace",
          userId: "user_001",
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(201);
    expect(reply.payload).toEqual({
      success: true,
      crashId: "fb_001",
      githubSyncQueued: true,
      skipped: false,
    });
    expect(mockPrisma.feedbackSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectKey: "laicai",
        type: "crash",
        channel: "crash",
        errorMessage: "app crashed",
        githubSyncStatus: "pending",
      }),
    });
    expect(mockPrisma.feedbackIssueOutbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        submissionId: "fb_001",
        projectKey: "laicai",
        status: "pending",
      }),
    });
  });

  it("stores error submissions as skipped when error reporting is disabled", async () => {
    const handler = handlers.get("POST /v1/feedback/submit-errors");
    const reply = makeReply();
    mockPrisma.feedbackProjectConfig.findUnique.mockResolvedValue({
      projectKey: "laicai",
      manualFeedbackEnabled: true,
      githubIssueSyncEnabled: true,
      githubRepoOwner: "joya",
      githubRepoName: "laicai",
      githubToken: "ghs_test_token",
      errorReportingEnabled: false,
      crashReportingEnabled: true,
    });

    await handler(
      {
        headers: { "x-project-key": "laicai" },
        body: {
          projectKey: "laicai",
          errors: [
            {
              errorMessage: "socket timeout",
              errorType: "TimeoutError",
            },
          ],
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(201);
    expect(reply.payload).toEqual({
      success: true,
      results: [
        {
          issueNumber: null,
          submissionId: "fb_001",
          githubSyncQueued: false,
          skipped: true,
        },
      ],
    });
    expect(mockPrisma.feedbackSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        projectKey: "laicai",
        type: "error",
        channel: "error",
        errorMessage: "socket timeout",
        githubSyncStatus: "skipped",
        status: "skipped",
      }),
    });
    expect(mockPrisma.feedbackIssueOutbox.create).not.toHaveBeenCalled();
  });

  it("deduplicates submit-errors within same batch and reuses single issue group", async () => {
    const handler = handlers.get("POST /v1/feedback/submit-errors");
    const reply = makeReply();

    mockPrisma.feedbackSubmission.create
      .mockResolvedValueOnce({
        id: "fb_error_001",
        projectKey: "laicai",
        type: "error",
        channel: "error",
        status: "pending",
        githubSyncStatus: "pending",
        githubIssueNumber: null,
      });

    await handler(
      {
        headers: { "x-project-key": "laicai" },
        body: {
          projectKey: "laicai",
          runtimeEnv: "dev",
          errors: [
            {
              errorMessage: "socket timeout at 2026-04-21T10:00:00Z device-id=abc123",
              errorType: "SocketException",
              stackTrace: "at Foo /app/file.dart:12:34\nat Bar /app/file.dart:56:78",
              currentRoute: "/home",
            },
            {
              errorMessage: "socket timeout at 2026-04-21T10:01:59Z device-id=xyz789",
              errorType: "SocketException",
              stackTrace: "at Foo /app/file.dart:99:88\nat Bar /app/file.dart:77:66",
              currentRoute: "/home",
            },
          ],
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(201);
    expect(mockPrisma.feedbackIssueGroup.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.feedbackSubmission.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.feedbackIssueOutbox.create).toHaveBeenCalledTimes(1);
    expect(reply.payload).toEqual({
      success: true,
      results: [
        {
          issueNumber: null,
          submissionId: "fb_error_001",
          githubSyncQueued: true,
          skipped: false,
        },
        {
          issueNumber: null,
          submissionId: "fb_error_001",
          githubSyncQueued: false,
          skipped: false,
        },
      ],
    });
  });

  it("lists user-facing feedback submissions with final-state fields mapped from raw records", async () => {
    const handler = handlers.get("GET /v1/feedback/submissions");
    const reply = makeReply();
    mockPrisma.feedbackSubmission.findMany.mockResolvedValue([
      {
        id: "fb_001",
        projectKey: "laicai",
        type: "manual",
        channel: "manual",
        title: "无法上传头像",
        description: "点击保存后没有反应",
        status: "fixed",
        fixedInVersion: "1.2.3",
        fixedAt: new Date("2026-04-19T10:00:00Z"),
        fixVerified: true,
        verificationFeedback: "已验证修复",
        verifiedAt: new Date("2026-04-20T10:00:00Z"),
        statusHistoryJson: JSON.stringify([{ status: "reported" }, { status: "fixed" }, { status: "closed" }]),
        createdAt: new Date("2026-04-18T10:00:00Z"),
        updatedAt: new Date("2026-04-20T11:00:00Z"),
        userId: "user_001",
        username: "joya",
        deviceInfo: JSON.stringify({ model: "iPhone", osVersion: "17.5" }),
        currentRoute: "/feedback/create",
        appVersion: "1.0.3",
        buildNumber: "41",
        attachmentsJson: null,
        metadataJson: JSON.stringify({ feedbackType: "bug" }),
        githubIssueNumber: 42,
        githubIssueUrl: "https://github.com/joya/laicai/issues/42",
      },
    ]);

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        query: { userId: "user_001", type: "manual" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(mockPrisma.feedbackSubmission.findMany).toHaveBeenCalledWith({
      where: {
        projectKey: "laicai",
        userId: "user_001",
        type: "manual",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(reply.payload).toEqual({
      submissions: [
        expect.objectContaining({
          id: "fb_001",
          _id: "fb_001",
          userId: "user_001",
          feedbackType: "bug",
          status: "fixed",
          screenshotUrls: [],
          deviceInfo: { model: "iPhone", osVersion: "17.5" },
          currentRoute: "/feedback/create",
          appVersion: "1.0.3",
          buildNumber: "41",
          githubIssueNumber: 42,
          githubIssueUrl: "https://github.com/joya/laicai/issues/42",
          fixVersion: "1.2.3",
          fixedAt: new Date("2026-04-19T10:00:00Z"),
          fixVerified: true,
          verificationFeedback: "已验证修复",
          verifiedAt: new Date("2026-04-20T10:00:00Z"),
          statusHistory: [
            { status: "reported", timestamp: expect.any(String), comment: null },
            { status: "fixed", timestamp: expect.any(String), comment: null },
            { status: "closed", timestamp: expect.any(String), comment: null },
          ],
        }),
      ],
    });
  });

  it("defaults user-facing list to manual submissions only when no type filter is provided", async () => {
    const handler = handlers.get("GET /v1/feedback/submissions");
    const reply = makeReply();
    mockPrisma.feedbackSubmission.findMany.mockResolvedValue([]);

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        query: { userId: "user_001" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(mockPrisma.feedbackSubmission.findMany).toHaveBeenCalledWith({
      where: {
        projectKey: "laicai",
        userId: "user_001",
        type: "manual",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(reply.payload).toEqual({ submissions: [] });
  });

  it("lists feedback submissions for admin API scoped by request projectKey", async () => {
    const handler = handlers.get("GET /v1/admin/feedback/submissions");
    const reply = makeReply();
    mockPrisma.feedbackSubmission.findMany.mockResolvedValue([
      {
        id: "fb_001",
        projectKey: "laicai",
        type: "manual",
        title: "无法上传头像",
        status: "pending",
        githubSyncStatus: "pending",
        createdAt: new Date("2026-04-19T10:00:00Z"),
      },
    ]);

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        query: { projectKey: "laicai" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(mockPrisma.feedbackSubmission.findMany).toHaveBeenCalledWith({
      where: { projectKey: "laicai" },
      orderBy: { createdAt: "desc" },
    });
    expect(reply.payload).toEqual({
      submissions: [
        expect.objectContaining({
          id: "fb_001",
          projectKey: "laicai",
          title: "无法上传头像",
        }),
      ],
    });
  });

  it("verifies a fixed submission within current project and matching user scope", async () => {
    const handler = handlers.get("POST /v1/feedback/verify-fix");
    const reply = makeReply();
    mockPrisma.feedbackSubmission.findUnique.mockResolvedValueOnce({
      id: "fb_001",
      projectKey: "laicai",
      userId: "user_001",
      status: "fixed",
      statusHistoryJson: JSON.stringify([{ status: "reported" }, { status: "fixed" }]),
    });

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        body: {
          feedbackId: "fb_001",
          verified: true,
          feedback: "修好了",
          appVersion: "1.2.3",
          userId: "user_001",
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(mockPrisma.feedbackSubmission.update).toHaveBeenCalledWith({
      where: { id: "fb_001" },
      data: expect.objectContaining({
        fixVerified: true,
        verificationFeedback: "修好了",
        verifiedAt: expect.any(Date),
        appVersion: "1.2.3",
        status: "fixed",
        statusHistoryJson: expect.stringContaining('"status":"fixed"'),
      }),
    });
  });

  it("rejects verify-fix when userId mismatches submission owner", async () => {
    const handler = handlers.get("POST /v1/feedback/verify-fix");
    const reply = makeReply();
    mockPrisma.feedbackSubmission.findUnique.mockResolvedValueOnce({
      id: "fb_001",
      projectKey: "laicai",
      userId: "user_999",
      status: "fixed",
      statusHistoryJson: JSON.stringify([{ status: "reported" }, { status: "fixed" }]),
    });

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        body: {
          feedbackId: "fb_001",
          verified: false,
          feedback: "还没修好",
          userId: "user_001",
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(404);
    expect(reply.payload).toEqual({ error: "feedback_submission_not_found" });
    expect(mockPrisma.feedbackSubmission.update).not.toHaveBeenCalled();
  });

  it("rejects admin submission list when query projectKey mismatches auth project", async () => {
    const handler = handlers.get("GET /v1/admin/feedback/submissions");
    const reply = makeReply();

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        query: { projectKey: "infov" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(403);
    expect(reply.payload).toEqual({ error: "project_key_mismatch" });
    expect(mockPrisma.feedbackSubmission.findMany).not.toHaveBeenCalled();
  });

  it("returns feedback submission detail for admin API when submission belongs to auth project", async () => {
    const handler = handlers.get("GET /v1/admin/feedback/submissions/:id");
    const reply = makeReply();
    mockPrisma.feedbackSubmission.findUnique.mockResolvedValue({
      id: "fb_001",
      projectKey: "laicai",
      type: "manual",
      title: "无法上传头像",
      description: "点击保存后没有反应",
      attachmentsJson: JSON.stringify([{ name: "a.png" }]),
      metadataJson: JSON.stringify({ route: "/profile" }),
      githubSyncStatus: "pending",
    });

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        params: { id: "fb_001" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(reply.payload).toMatchObject({
      id: "fb_001",
      title: "无法上传头像",
      githubSyncStatus: "pending",
    });
  });

  it("rejects feedback submission detail when submission belongs to another project", async () => {
    const handler = handlers.get("GET /v1/admin/feedback/submissions/:id");
    const reply = makeReply();
    mockPrisma.feedbackSubmission.findUnique.mockResolvedValue({
      id: "fb_001",
      projectKey: "infov",
      type: "manual",
      title: "无法上传头像",
      description: "点击保存后没有反应",
      attachmentsJson: null,
      metadataJson: null,
      githubSyncStatus: "pending",
    });

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        params: { id: "fb_001" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(404);
    expect(reply.payload).toEqual({ error: "feedback_submission_not_found" });
  });

  it("requeues github sync for a submission within auth project", async () => {
    const handler = handlers.get("POST /v1/admin/feedback/submissions/:id/retry-github-sync");
    const reply = makeReply();
    mockPrisma.feedbackSubmission.findUnique.mockResolvedValue({
      id: "fb_001",
      projectKey: "laicai",
      githubSyncStatus: "failed",
    });
    mockPrisma.feedbackIssueOutbox.findMany.mockResolvedValueOnce([]);

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        params: { id: "fb_001" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(202);
    expect(mockPrisma.feedbackSubmission.update).toHaveBeenCalledWith({
      where: { id: "fb_001" },
      data: expect.objectContaining({
        githubSyncStatus: "pending",
      }),
    });
    expect(mockPrisma.feedbackIssueOutbox.findMany).toHaveBeenCalledWith({
      where: {
        submissionId: "fb_001",
        status: {
          in: ["pending", "processing"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    expect(mockPrisma.feedbackIssueOutbox.create).toHaveBeenCalled();
  });

  it("reuses active outbox job instead of creating duplicate retry job", async () => {
    const handler = handlers.get("POST /v1/admin/feedback/submissions/:id/retry-github-sync");
    const reply = makeReply();
    mockPrisma.feedbackSubmission.findUnique.mockResolvedValue({
      id: "fb_001",
      projectKey: "laicai",
      githubSyncStatus: "failed",
    });
    mockPrisma.feedbackIssueOutbox.findMany.mockResolvedValueOnce([
      {
        id: "outbox_001",
        submissionId: "fb_001",
        projectKey: "laicai",
        status: "pending",
      },
    ]);

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        params: { id: "fb_001" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(202);
    expect(mockPrisma.feedbackIssueOutbox.create).not.toHaveBeenCalled();
  });

  it("rejects github sync retry when submission belongs to another project", async () => {
    const handler = handlers.get("POST /v1/admin/feedback/submissions/:id/retry-github-sync");
    const reply = makeReply();
    mockPrisma.feedbackSubmission.findUnique.mockResolvedValue({
      id: "fb_001",
      projectKey: "infov",
      githubSyncStatus: "failed",
    });

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        params: { id: "fb_001" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(404);
    expect(reply.payload).toEqual({ error: "feedback_submission_not_found" });
    expect(mockPrisma.feedbackSubmission.update).not.toHaveBeenCalled();
    expect(mockPrisma.feedbackIssueOutbox.create).not.toHaveBeenCalled();
  });

  it("processes pending outbox jobs from admin API using auth project scope", async () => {
    const handler = handlers.get("POST /v1/admin/feedback/process-pending");
    const reply = makeReply();
    mockPrisma.feedbackSubmission.findMany.mockResolvedValue([
      {
        id: "fb_001",
        projectKey: "laicai",
        githubSyncStatus: "pending",
        createdAt: new Date("2026-04-19T10:00:00Z"),
      },
      {
        id: "fb_002",
        projectKey: "laicai",
        githubSyncStatus: "pending",
        createdAt: new Date("2026-04-19T10:05:00Z"),
      },
    ]);

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
      },
      reply,
    );

    expect(reply.statusCode).toBe(202);
    expect(mockPrisma.feedbackSubmission.findMany).toHaveBeenCalledWith({
      where: {
        projectKey: "laicai",
        githubSyncStatus: "pending",
      },
      orderBy: { createdAt: "asc" },
    });
    expect(reply.payload).toEqual({
      accepted: true,
      queuedCount: 2,
    });
    expect(mockPrisma.feedbackIssueOutbox.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        submissionId: "fb_001",
        projectKey: "laicai",
        status: "pending",
      }),
    });
    expect(mockPrisma.feedbackIssueOutbox.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        submissionId: "fb_002",
        projectKey: "laicai",
        status: "pending",
      }),
    });
    expect(mockPrisma.feedbackSubmission.update).toHaveBeenNthCalledWith(1, {
      where: { id: "fb_001" },
      data: expect.objectContaining({
        githubSyncError: null,
        githubSyncRequestedAt: expect.any(Date),
      }),
    });
    expect(mockPrisma.feedbackSubmission.update).toHaveBeenNthCalledWith(2, {
      where: { id: "fb_002" },
      data: expect.objectContaining({
        githubSyncError: null,
        githubSyncRequestedAt: expect.any(Date),
      }),
    });
  });

  it("rejects process-pending when body projectKey mismatches auth project", async () => {
    const handler = handlers.get("POST /v1/admin/feedback/process-pending");
    const reply = makeReply();

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        body: { projectKey: "infov" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(403);
    expect(reply.payload).toEqual({ error: "project_key_mismatch" });
    expect(mockPrisma.feedbackSubmission.findMany).not.toHaveBeenCalled();
  });

  it("marks matching submissions fixed from admin route by github issue numbers", async () => {
    const handler = handlers.get("POST /v1/admin/feedback/mark-fixed");
    const reply = makeReply();
    mockPrisma.feedbackSubmission.findMany.mockResolvedValueOnce([
      {
        id: "fb_001",
        projectKey: "laicai",
        githubIssueNumber: 42,
        statusHistoryJson: JSON.stringify([{ status: "reported" }]),
      },
      {
        id: "fb_002",
        projectKey: "laicai",
        githubIssueNumber: 43,
        statusHistoryJson: JSON.stringify([{ status: "reported" }, { status: "open" }]),
      },
    ]);

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        body: {
          issueNumbers: [42, 43],
          version: "1.2.3",
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(mockPrisma.feedbackSubmission.findMany).toHaveBeenCalledWith({
      where: {
        projectKey: "laicai",
        githubIssueNumber: { in: [42, 43] },
      },
    });
    expect(mockPrisma.feedbackSubmission.update).toHaveBeenNthCalledWith(1, {
      where: { id: "fb_001" },
      data: expect.objectContaining({
        status: "fixed",
        fixedInVersion: "1.2.3",
        fixedAt: expect.any(Date),
        statusHistoryJson: expect.stringContaining('"status":"reported"'),
      }),
    });
    expect(mockPrisma.feedbackSubmission.update).toHaveBeenNthCalledWith(2, {
      where: { id: "fb_002" },
      data: expect.objectContaining({
        status: "fixed",
        fixedInVersion: "1.2.3",
        fixedAt: expect.any(Date),
        statusHistoryJson: expect.stringContaining('"status":"open"'),
      }),
    });
    expect(reply.payload).toEqual({
      success: true,
      updatedCount: 2,
      version: "1.2.3",
    });
  });

  it("reads feedback project config within auth project scope", async () => {
    const handler = handlers.get("GET /v1/admin/feedback/project-config/:projectKey");
    const reply = makeReply();

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        params: { projectKey: "laicai" },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(reply.payload).toEqual({
      projectKey: "laicai",
      issueTracker: "github",
      githubRepoOwner: "joya",
      githubRepoName: "laicai",
      githubIssueSyncEnabled: true,
      manualFeedbackEnabled: true,
      errorReportingEnabled: true,
      crashReportingEnabled: true,
      hasGithubToken: true,
      cnbRepoNamespace: null,
      cnbRepoName: null,
      hasCnbToken: false,
    });
  });

  it("updates feedback project config within auth project scope", async () => {
    const handler = handlers.get("PUT /v1/admin/feedback/project-config/:projectKey");
    const reply = makeReply();

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        params: { projectKey: "laicai" },
        body: {
          githubRepoOwner: "joya",
          githubRepoName: "laicai",
          githubIssueSyncEnabled: true,
          manualFeedbackEnabled: true,
          errorReportingEnabled: true,
          crashReportingEnabled: true,
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(200);
    expect(mockPrisma.feedbackProjectConfig.upsert).toHaveBeenCalledWith({
      where: { projectKey: "laicai" },
      update: expect.objectContaining({
        githubRepoOwner: "joya",
        githubRepoName: "laicai",
        githubIssueSyncEnabled: true,
      }),
      create: expect.objectContaining({
        projectKey: "laicai",
      }),
    });
  });

  it("rejects feedback project config update when param projectKey mismatches auth project", async () => {
    const handler = handlers.get("PUT /v1/admin/feedback/project-config/:projectKey");
    const reply = makeReply();

    await handler(
      {
        projectKey: "laicai",
        runtimeEnv: "dev",
        params: { projectKey: "infov" },
        body: {
          githubRepoOwner: "joya",
          githubRepoName: "infov",
          githubIssueSyncEnabled: true,
          manualFeedbackEnabled: true,
          errorReportingEnabled: true,
          crashReportingEnabled: true,
        },
      },
      reply,
    );

    expect(reply.statusCode).toBe(403);
    expect(reply.payload).toEqual({ error: "project_key_mismatch" });
    expect(mockPrisma.feedbackProjectConfig.upsert).not.toHaveBeenCalled();
  });
});

describe("feedback outbox worker loop", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("runs feedback outbox processing immediately and on interval without overlap", async () => {
    let releaseRun!: () => void;
    const runOutbox = vi.fn(
      (): Promise<void> =>
        new Promise<void>((resolve) => {
          releaseRun = resolve;
        }),
    );

    const loop = startFeedbackOutboxLoop({
      intervalMs: 60_000,
      runOutbox,
    });

    vi.runAllTicks();
    await Promise.resolve();
    expect(runOutbox).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(runOutbox).toHaveBeenCalledTimes(1);

    releaseRun();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(runOutbox).toHaveBeenCalledTimes(2);

    loop.stop();
  });

  it("creates github issue and marks submission synced", async () => {
    const prisma = {
      feedbackIssueOutbox: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "outbox_001",
              submissionId: "fb_001",
              projectKey: "laicai",
              status: "pending",
              attemptCount: 0,
              nextRetryAt: null,
            },
          ])
          .mockResolvedValueOnce([
            {
              id: "outbox_001",
              submissionId: "fb_001",
              projectKey: "laicai",
              status: "processing",
              attemptCount: 0,
              nextRetryAt: null,
            },
          ]),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      feedbackSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "fb_001",
          projectKey: "laicai",
          type: "manual",
          channel: "manual",
          title: "无法上传头像",
          description: "点击保存没有反应",
          errorMessage: null,
          errorType: null,
          stackTrace: null,
          userId: "user_001",
          username: "joya",
          currentRoute: "/profile",
          appVersion: "1.0.0",
          buildNumber: "10",
          deviceInfo: JSON.stringify({ platform: "iOS", model: "iPhone 15 Pro", os: "iOS", osVersion: "17.5", isPhysicalDevice: true }),
          attachmentsJson: JSON.stringify([{ name: "a.png" }]),
          metadataJson: JSON.stringify({ route: "/profile" }),
          githubSyncStatus: "pending",
          githubIssueNumber: null,
          githubIssueUrl: null,
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      feedbackProjectConfig: {
        findUnique: vi.fn().mockResolvedValue({
          projectKey: "laicai",
          issueTracker: "github",
          githubRepoOwner: "joya",
          githubRepoName: "laicai",
          githubToken: "ghs_test_token",
          githubIssueSyncEnabled: true,
        }),
      },
      feedbackIssueGroup: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ number: 42, html_url: "https://github.com/joya/laicai/issues/42" }),
    });

    const result = await runFeedbackOutbox({
      prisma,
      now: () => new Date("2026-04-19T10:00:00Z"),
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result).toEqual({
      scanned: 1,
      processed: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.github.com/repos/joya/laicai/issues",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer ghs_test_token",
        }),
      }),
    );
    expect(prisma.feedbackIssueOutbox.update).toHaveBeenCalledWith({
      where: { id: "outbox_001" },
      data: expect.objectContaining({
        status: "completed",
        attemptCount: 1,
        lastError: null,
        nextRetryAt: null,
      }),
    });
    expect(prisma.feedbackSubmission.update).toHaveBeenCalledWith({
      where: { id: "fb_001" },
      data: expect.objectContaining({
        githubIssueNumber: 42,
        githubIssueUrl: "https://github.com/joya/laicai/issues/42",
        githubSyncStatus: "synced",
        githubSyncAttempts: 1,
        githubSyncError: null,
        githubSyncRequestedAt: new Date("2026-04-19T10:00:00Z"),
        githubSyncedAt: new Date("2026-04-19T10:00:00Z"),
        status: "reported",
      }),
    });
  });

  it("creates cnb issue with string issue number and fallback url", async () => {
    const prisma = {
      feedbackIssueOutbox: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "outbox_cnb_001",
              submissionId: "fb_cnb_001",
              projectKey: "laicai",
              status: "pending",
              attemptCount: 0,
              nextRetryAt: null,
            },
          ])
          .mockResolvedValueOnce([
            {
              id: "outbox_cnb_001",
              submissionId: "fb_cnb_001",
              projectKey: "laicai",
              status: "processing",
              attemptCount: 0,
              nextRetryAt: null,
            },
          ]),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      feedbackSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "fb_cnb_001",
          projectKey: "laicai",
          type: "manual",
          channel: "manual",
          title: "CNB smoke",
          description: "CNB sync smoke",
          errorMessage: null,
          errorType: null,
          stackTrace: null,
          userId: "user_001",
          username: "joya",
          currentRoute: "/profile",
          appVersion: "1.0.0",
          buildNumber: "10",
          deviceInfo: null,
          attachmentsJson: null,
          metadataJson: null,
          githubSyncStatus: "pending",
          githubIssueNumber: null,
          githubIssueUrl: null,
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      feedbackProjectConfig: {
        findUnique: vi.fn().mockResolvedValue({
          projectKey: "laicai",
          issueTracker: "cnb",
          githubRepoOwner: "JoyaWang",
          githubRepoName: "Laicai",
          githubToken: "ghs_test_token",
          cnbRepoNamespace: "joyawang",
          cnbRepoName: "Laicai",
          cnbToken: "cnb_test_token",
          githubIssueSyncEnabled: true,
        }),
      },
      feedbackIssueGroup: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ number: "1" }),
    });

    const result = await runFeedbackOutbox({
      prisma,
      now: () => new Date("2026-04-28T09:11:54Z"),
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result).toEqual({
      scanned: 1,
      processed: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.cnb.cool/joyawang/Laicai/-/issues",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Accept: "application/vnd.cnb.api+json",
          Authorization: "Bearer cnb_test_token",
        }),
      }),
    );
    expect(prisma.feedbackSubmission.update).toHaveBeenCalledWith({
      where: { id: "fb_cnb_001" },
      data: expect.objectContaining({
        githubIssueNumber: 1,
        githubIssueUrl: "https://cnb.cool/joyawang/Laicai/-/issues/1",
        githubSyncStatus: "synced",
        status: "reported",
      }),
    });
  });

  it("retries github issue sync with backoff when github api fails", async () => {
    const prisma = {
      feedbackIssueOutbox: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "outbox_001",
              submissionId: "fb_001",
              projectKey: "laicai",
              status: "pending",
              attemptCount: 1,
              nextRetryAt: null,
            },
          ])
          .mockResolvedValueOnce([
            {
              id: "outbox_001",
              submissionId: "fb_001",
              projectKey: "laicai",
              status: "processing",
              attemptCount: 1,
              nextRetryAt: null,
            },
          ]),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      feedbackSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "fb_001",
          projectKey: "laicai",
          type: "manual",
          channel: "manual",
          title: "无法上传头像",
          description: "点击保存没有反应",
          errorMessage: null,
          errorType: null,
          stackTrace: null,
          userId: "user_001",
          username: "joya",
          currentRoute: "/profile",
          appVersion: "1.0.0",
          buildNumber: "10",
          deviceInfo: null,
          attachmentsJson: null,
          metadataJson: null,
          githubSyncStatus: "pending",
          githubIssueNumber: null,
          githubIssueUrl: null,
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      feedbackProjectConfig: {
        findUnique: vi.fn().mockResolvedValue({
          projectKey: "laicai",
          issueTracker: "github",
          githubRepoOwner: "joya",
          githubRepoName: "laicai",
          githubToken: "ghs_test_token",
          githubIssueSyncEnabled: true,
        }),
      },
      feedbackIssueGroup: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("boom"),
    });

    const result = await runFeedbackOutbox({
      prisma,
      now: () => new Date("2026-04-19T10:00:00Z"),
      fetchImpl: fetchImpl as typeof fetch,
      maxAttempts: 5,
    });

    expect(result).toEqual({
      scanned: 1,
      processed: 1,
      succeeded: 0,
      failed: 1,
      skipped: 0,
    });
    expect(prisma.feedbackIssueOutbox.update).toHaveBeenCalledWith({
      where: { id: "outbox_001" },
      data: expect.objectContaining({
        status: "pending",
        attemptCount: 2,
        lastError: expect.stringContaining("github_issue_create_failed:500:boom"),
        nextRetryAt: new Date("2026-04-19T10:04:00Z"),
      }),
    });
    expect(prisma.feedbackSubmission.update).toHaveBeenCalledWith({
      where: { id: "fb_001" },
      data: expect.objectContaining({
        githubSyncStatus: "pending",
        githubSyncAttempts: 2,
        githubSyncError: expect.stringContaining("github_issue_create_failed:500:boom"),
        githubSyncRequestedAt: new Date("2026-04-19T10:00:00Z"),
      }),
    });
  });

  it("skips duplicate issue creation when submission already synced", async () => {
    const prisma = {
      feedbackIssueOutbox: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "outbox_001",
            submissionId: "fb_001",
            projectKey: "laicai",
            status: "pending",
            attemptCount: 1,
            nextRetryAt: null,
          },
        ]),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      feedbackSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "fb_001",
          projectKey: "laicai",
          type: "manual",
          channel: "manual",
          title: "无法上传头像",
          description: "点击保存没有反应",
          errorMessage: null,
          errorType: null,
          stackTrace: null,
          userId: "user_001",
          username: "joya",
          currentRoute: "/profile",
          appVersion: "1.0.0",
          buildNumber: "10",
          deviceInfo: null,
          attachmentsJson: null,
          metadataJson: null,
          githubSyncStatus: "synced",
          githubIssueNumber: 42,
          githubIssueUrl: "https://github.com/joya/laicai/issues/42",
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      feedbackProjectConfig: {
        findUnique: vi.fn(),
      },
      feedbackIssueGroup: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const fetchImpl = vi.fn();

    const result = await runFeedbackOutbox({
      prisma,
      now: () => new Date("2026-04-19T10:00:00Z"),
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result).toEqual({
      scanned: 1,
      processed: 1,
      succeeded: 0,
      failed: 0,
      skipped: 1,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(prisma.feedbackIssueOutbox.update).toHaveBeenCalledWith({
      where: { id: "outbox_001" },
      data: expect.objectContaining({
        status: "completed",
      }),
    });
  });

  it("reuses existing github issue from issue group without creating a new issue", async () => {
    const prisma = {
      feedbackIssueOutbox: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "outbox_002",
              submissionId: "fb_002",
              projectKey: "laicai",
              status: "pending",
              attemptCount: 0,
              nextRetryAt: null,
            },
          ])
          .mockResolvedValueOnce([
            {
              id: "outbox_002",
              submissionId: "fb_002",
              projectKey: "laicai",
              status: "processing",
              attemptCount: 0,
              nextRetryAt: null,
            },
          ]),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      feedbackSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "fb_002",
          projectKey: "laicai",
          type: "error",
          channel: "error",
          title: null,
          description: null,
          errorMessage: "socket timeout",
          errorType: "SocketException",
          stackTrace: "trace",
          userId: "user_001",
          username: "joya",
          currentRoute: "/home",
          appVersion: "1.0.0",
          buildNumber: "10",
          deviceInfo: null,
          attachmentsJson: null,
          metadataJson: null,
          githubSyncStatus: "pending",
          githubIssueNumber: null,
          githubIssueUrl: null,
          issueGroupId: "group_001",
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      feedbackProjectConfig: {
        findUnique: vi.fn().mockResolvedValue({
          projectKey: "laicai",
          issueTracker: "github",
          githubRepoOwner: "joya",
          githubRepoName: "laicai",
          githubToken: "ghs_test_token",
          githubIssueSyncEnabled: true,
        }),
      },
      feedbackIssueGroup: {
        findUnique: vi.fn().mockResolvedValue({
          id: "group_001",
          projectKey: "laicai",
          runtimeEnv: "dev",
          normalizedFingerprint: "fingerprint_001",
          normalizedSummary: "[/home] SocketException",
          githubIssueNumber: 42,
          githubIssueUrl: "https://github.com/joya/laicai/issues/42",
          occurrenceCount: 2,
          latestSubmissionId: "fb_001",
          status: "open",
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const fetchImpl = vi.fn();

    const result = await runFeedbackOutbox({
      prisma,
      now: () => new Date("2026-04-19T10:00:00Z"),
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(result).toEqual({
      scanned: 1,
      processed: 1,
      succeeded: 1,
      failed: 0,
      skipped: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(prisma.feedbackSubmission.update).toHaveBeenCalledWith({
      where: { id: "fb_002" },
      data: expect.objectContaining({
        githubIssueNumber: 42,
        githubIssueUrl: "https://github.com/joya/laicai/issues/42",
        githubSyncStatus: "synced",
        status: "reported",
      }),
    });
  });

  it("includes deviceInfo in github issue body metadata", async () => {
    const prisma = {
      feedbackIssueOutbox: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "outbox_001",
              submissionId: "fb_001",
              projectKey: "laicai",
              status: "pending",
              attemptCount: 0,
              nextRetryAt: null,
            },
          ])
          .mockResolvedValueOnce([
            {
              id: "outbox_001",
              submissionId: "fb_001",
              projectKey: "laicai",
              status: "processing",
              attemptCount: 0,
              nextRetryAt: null,
            },
          ]),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      feedbackSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "fb_001",
          projectKey: "laicai",
          type: "manual",
          channel: "manual",
          title: "app crash",
          description: "crashed on launch",
          errorMessage: null,
          errorType: null,
          stackTrace: null,
          userId: "user_001",
          username: "joya",
          currentRoute: "/home",
          appVersion: "1.0.3",
          buildNumber: "41",
          deviceInfo: JSON.stringify({
            platform: "android",
            model: "Pixel 8 Pro",
            os: "Android",
            osVersion: "14",
            isPhysicalDevice: true,
          }),
          attachmentsJson: null,
          metadataJson: null,
          githubSyncStatus: "pending",
          githubIssueNumber: null,
          githubIssueUrl: null,
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      feedbackProjectConfig: {
        findUnique: vi.fn().mockResolvedValue({
          projectKey: "laicai",
          issueTracker: "github",
          githubRepoOwner: "joya",
          githubRepoName: "laicai",
          githubToken: "ghs_test_token",
          githubIssueSyncEnabled: true,
        }),
      },
      feedbackIssueGroup: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ number: 99, html_url: "https://github.com/joya/laicai/issues/99" }),
    });

    await runFeedbackOutbox({
      prisma,
      now: () => new Date("2026-04-19T10:00:00Z"),
      fetchImpl: fetchImpl as typeof fetch,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const fetchCall = fetchImpl.mock.calls[0];
    const body = JSON.parse(fetchCall[1].body);

    // Verify the issue body contains Metadata section with deviceInfo
    const metadataMatch = body.body.match(/## Metadata\n```json\n([\s\S]*?)\n```/);
    expect(metadataMatch).not.toBeNull();
    const metadata = JSON.parse(metadataMatch![1]);

    expect(metadata.deviceInfo).toEqual({
      platform: "android",
      model: "Pixel 8 Pro",
      os: "Android",
      osVersion: "14",
      isPhysicalDevice: true,
    });

    // Existing fields must remain intact
    expect(metadata.userId).toBe("user_001");
    expect(metadata.username).toBe("joya");
    expect(metadata.currentRoute).toBe("/home");
    expect(metadata.appVersion).toBe("1.0.3");
    expect(metadata.buildNumber).toBe("41");
  });

  it("sets deviceInfo to null in github issue body when submission has no deviceInfo", async () => {
    const prisma = {
      feedbackIssueOutbox: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([
            {
              id: "outbox_001",
              submissionId: "fb_001",
              projectKey: "laicai",
              status: "pending",
              attemptCount: 0,
              nextRetryAt: null,
            },
          ])
          .mockResolvedValueOnce([
            {
              id: "outbox_001",
              submissionId: "fb_001",
              projectKey: "laicai",
              status: "processing",
              attemptCount: 0,
              nextRetryAt: null,
            },
          ]),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      feedbackSubmission: {
        findUnique: vi.fn().mockResolvedValue({
          id: "fb_001",
          projectKey: "laicai",
          type: "manual",
          channel: "manual",
          title: "no device info",
          description: "old submission without device",
          errorMessage: null,
          errorType: null,
          stackTrace: null,
          userId: "user_001",
          username: "joya",
          currentRoute: "/profile",
          appVersion: "1.0.0",
          buildNumber: "10",
          deviceInfo: null,
          attachmentsJson: null,
          metadataJson: null,
          githubSyncStatus: "pending",
          githubIssueNumber: null,
          githubIssueUrl: null,
        }),
        update: vi.fn().mockResolvedValue(undefined),
      },
      feedbackProjectConfig: {
        findUnique: vi.fn().mockResolvedValue({
          projectKey: "laicai",
          issueTracker: "github",
          githubRepoOwner: "joya",
          githubRepoName: "laicai",
          githubToken: "ghs_test_token",
          githubIssueSyncEnabled: true,
        }),
      },
      feedbackIssueGroup: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ number: 100, html_url: "https://github.com/joya/laicai/issues/100" }),
    });

    await runFeedbackOutbox({
      prisma,
      now: () => new Date("2026-04-19T10:00:00Z"),
      fetchImpl: fetchImpl as typeof fetch,
    });

    const fetchCall = fetchImpl.mock.calls[0];
    const issueBody = JSON.parse(fetchCall[1].body);
    const metadataMatch = issueBody.body.match(/## Metadata\n```json\n([\s\S]*?)\n```/);
    const metadata = JSON.parse(metadataMatch![1]);

    expect(metadata.deviceInfo).toBeNull();
    // No fake default value
    expect(metadata.userId).toBe("user_001");
  });
});
