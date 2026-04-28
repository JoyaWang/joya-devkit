# SRS → CNB Issue 迁移改造方案

> 日期：2026-04-28
> 状态：已实施并通过 prod 端到端验证

---

## 0. 最终实施结果

- 代码提交：
  - `a38e3d7 fix(srs): parse CNB issue numbers`
  - `6a61406 fix(srs): make feedback issue sync retry idempotent`
- CNB prod deploy：`cnb-t5o-1jn9nroed` 成功。
- 本地验证：`pnpm typecheck` 通过；`pnpm vitest run tests/feedback-minimal-closure.test.mts` 37/37 通过。
- 线上配置：Laicai `FeedbackProjectConfig.issueTracker=cnb`，CNB repo=`joyawang/Laicai`。
- 线上验证：fresh smoke submission `cmoify5qf000501n5pfljqlt0` 创建 CNB Issue #6，SRS 状态为 `githubSyncStatus=synced`。
- 生产兼容修复：CNB Issue API 返回 `number` 为字符串，已归一化为 Prisma `Int`；CNB 缺 `html_url` 时用 `https://cnb.cool/joyawang/Laicai/-/issues/{number}` 兜底。
- Retry 幂等修复：已有 issue number/url 的 submission 不再重复建外部 issue，并会把 stale `pending` 修复为 `synced`。

---

## 一、已完成（Alice 侧）

| 事项 | 状态 | 结果 |
|------|------|------|
| CNB 仓库创建 | ✅ | `joyawang/Laicai` https://cnb.cool/joyawang/Laicai |
| CNB Label 创建 | ✅ | 12 个标签全部创建 |
| CNB Token | ✅ | 从 Vault infra/providers 获取 |

### 已创建 Label

| Label | Color | 用途 |
|-------|-------|------|
| bug | #ff0000 | Bug 报告 |
| feedback | #0366d6 | 用户反馈 |
| user-reported | #fbca04 | 用户报告 |
| enhancement | #a2eeef | 功能请求 |
| user-requested | #d876e3 | 用户请求 |
| type:bug | #d73a4a | 类型：Bug |
| type:feature | #0052cc | 类型：功能 |
| channel:manual | #7057ff | 手动反馈渠道 |
| channel:error | #6e7781 | 自动错误上报 |
| channel:crash | #000000 | 自动崩溃上报 |
| reopened | #fef2c0 | 重新打开 |
| needs-info | #cfd3d7 | 需要更多信息 |

---

## 二、SRS 改造范围

### 2.1 核心策略：平台切换字段

在 `FeedbackProjectConfig` 中新增 `issueTracker` 字段（`github` | `cnb`），worker 根据该字段决定调用哪个平台 API。

**不改动现有字段名**（`githubIssueNumber`/`githubIssueUrl` 等保持原名，内部逻辑中理解为 "issueNumber"/"issueUrl"）。

### 2.2 改造文件清单

| 文件 | 改造内容 |
|------|----------|
| `prisma/schema.prisma` | `FeedbackProjectConfig` 新增 4 个字段 |
| `prisma/migrations/` | 新增 migration |
| `apps/worker/src/feedback-outbox-runner.ts` | 增加 CNB API 调用分支 |
| `apps/api/src/routes/feedback.ts` | admin config API 支持 CNB 字段 |
| `apps/api/src/routes/feedback.ts` | admin config update 校验逻辑 |

---

## 三、详细改造点

### 3.1 Prisma Schema

```prisma
model FeedbackProjectConfig {
  id                     String   @id @default(cuid())
  projectKey             String   @unique @map("project_key")

  // 平台选择
  issueTracker           String   @default("github") @map("issue_tracker")

  // GitHub 配置（保持现有）
  githubRepoOwner        String?  @map("github_repo_owner")
  githubRepoName         String?  @map("github_repo_name")
  githubToken            String?  @map("github_token")

  // CNB 配置（新增）
  cnbRepoNamespace       String?  @map("cnb_repo_namespace")
  cnbRepoName            String?  @map("cnb_repo_name")
  cnbToken               String?  @map("cnb_token")

  githubIssueSyncEnabled Boolean  @default(false) @map("github_issue_sync_enabled")
  manualFeedbackEnabled  Boolean  @default(true) @map("manual_feedback_enabled")
  errorReportingEnabled  Boolean  @default(true) @map("error_reporting_enabled")
  crashReportingEnabled  Boolean  @default(true) @map("crash_reporting_enabled")
  updatedAt              DateTime @updatedAt @map("updated_at")

  @@map("feedback_project_configs")
}
```

### 3.2 Worker 改造（feedback-outbox-runner.ts）

**改造目标**：第 477-493 行的 GitHub API 调用改为平台分支。

**新增接口**：

```typescript
interface IssueTrackerConfig {
  type: "github" | "cnb";
  createIssueUrl: string;
  authHeader: string;
  headers: Record<string, string>;
  parseResponse: (json: unknown) => { number: number | null; html_url: string | null };
}
```

**核心替换逻辑**（第 475-493 行附近）：

```typescript
// 根据 config.issueTracker 选择平台
const tracker = buildIssueTracker(config);

const response = await fetchImpl(tracker.createIssueUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...tracker.headers,
    Authorization: tracker.authHeader,
    "User-Agent": "shared-runtime-services-feedback-worker",
  },
  body: JSON.stringify({
    title: buildIssueTitle(submission, group),
    body: buildIssueBody(submission),
    labels: ["feedback", `project:${submission.projectKey}`, `channel:${submission.channel}`],
  }),
});

if (!response.ok) { ... }

const issue = tracker.parseResponse(await response.json());
const issueNumber = issue.number ?? null;
const issueUrl = issue.html_url ?? null;
```

**buildIssueTracker 实现**：

```typescript
function buildIssueTracker(config: FeedbackProjectConfigRecord): IssueTrackerConfig {
  if (config.issueTracker === "cnb") {
    return {
      type: "cnb",
      createIssueUrl: `https://api.cnb.cool/${config.cnbRepoNamespace}/${config.cnbRepoName}/-/issues`,
      authHeader: `Bearer ${config.cnbToken}`,
      headers: { Accept: "application/vnd.cnb.api+json" },
      parseResponse: (json: any) => ({
        number: json.number ?? null,
        html_url: json.html_url ?? null,
      }),
    };
  }
  // 默认 GitHub
  return {
    type: "github",
    createIssueUrl: `https://api.github.com/repos/${config.githubRepoOwner}/${config.githubRepoName}/issues`,
    authHeader: `Bearer ${config.githubToken}`,
    headers: { Accept: "application/vnd.github+json" },
    parseResponse: (json: any) => ({
      number: json.number ?? null,
      html_url: json.html_url ?? null,
    }),
  };
}
```

### 3.3 Config 校验逻辑改造（第 375 行附近）

**原逻辑**：
```typescript
if (!config.githubRepoOwner || !config.githubRepoName || !config.githubToken) {
  throw new Error("missing_github_config");
}
```

**新逻辑**：
```typescript
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
```

### 3.4 Admin API 改造（feedback.ts）

**PUT /v1/admin/feedback/project-config/:projectKey**

新增支持字段：
- `issueTracker` (`github` | `cnb`)
- `cnbRepoNamespace`
- `cnbRepoName`
- `cnbToken`

校验规则：
- `issueTracker === "cnb"` 时，`cnbRepoNamespace`/`cnbRepoName`/`cnbToken` 必填
- `issueTracker === "github"` 时，保持现有校验

---

## 四、数据库迁移

```sql
-- prisma/migrations/20260428_add_cnb_tracker/migration.sql

ALTER TABLE feedback_project_configs
  ADD COLUMN issue_tracker TEXT NOT NULL DEFAULT 'github',
  ADD COLUMN cnb_repo_namespace TEXT,
  ADD COLUMN cnb_repo_name TEXT,
  ADD COLUMN cnb_token TEXT;

-- 为 laicai 项目写入 CNB 配置（部署后手动或通过 admin API）
-- UPDATE feedback_project_configs
-- SET issue_tracker = 'cnb',
--     cnb_repo_namespace = 'joyawang',
--     cnb_repo_name = 'Laicai',
--     cnb_token = '...',
--     github_issue_sync_enabled = true
-- WHERE project_key = 'laicai';
```

---

## 五、验证清单

| 验证项 | 方式 |
|--------|------|
| Migration 可执行 | `npx prisma migrate dev` |
| TypeScript 类型检查 | `pnpm typecheck` |
| Worker 单元测试 | `pnpm vitest run` |
| Admin API 单元测试 | 新增 CNB config 更新测试 |
| 端到端验证 | 手动：更新 laicai config → 触发 feedback → 确认 CNB Issue 创建 |

---

## 六、回滚

1. 改 `feedback_project_configs.issue_tracker` 回 `'github'`
2. 无需改代码，worker 自动回退到 GitHub API
3. CNB 上的 Issue 保留（只读归档）

---

## 七、参考

- CNB Issue API（从 CLI 源码推导）：
  - `POST api.cnb.cool/{namespace}/{repo}/-/issues`
  - `GET api.cnb.cool/{namespace}/{repo}/-/issues/{number}`
  - Auth: `Authorization: Bearer ${token}`
  - Accept: `application/vnd.cnb.api+json`
- CNB CLI 社区项目：`https://cnb.cool/haorwen/cnb-cli`
- 当前 SRS GitHub Issue 创建代码：`apps/worker/src/feedback-outbox-runner.ts` 第 477-493 行
