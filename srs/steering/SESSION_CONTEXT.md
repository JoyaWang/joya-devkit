# Session Context

## Purpose
Use this file as the only default recovery entry for a new session or after context compaction.
It should stay short and answer:
1. What is this project?
2. Which slice is active right now?
3. What decisions are already locked?
4. What should the agent do next by default?
5. If long-running mode is enabled, where is the runtime companion state?

Do not turn this file into a dated work log. Detailed history belongs in `progress.md`.

## Project Positioning
`shared-runtime-services` 是多个业务项目共用的共享运行时服务底座，面向 InfoV、Laicai 及后续活跃项目，统一承载 Object Service、Release Service 与 Shared Delivery Plane。`admin-platform` 是控制面，不是 runtime 真相源。真相源围绕 `projectKey + runtimeEnv + serviceType`。

## Current Mode
- Mode: `standard`
- Runtime companion: canonical repo 不依赖 `.agent/runtime/`；若当前机器已初始化本地 runtime companion，可把 `.agent/runtime/*` 当补充恢复线索，但 steering 文档仍是正式真相源

## Current Slice
- Phase: `feedback-srs-unification`
- Status: `implementation_complete_pending_live` — feedback schema / route / worker / focused tests 已完成，待送达 live 并联调 admin-platform / Laicai
- Active slice: `srs-feedback-minimal-closure`
- Latest checkpoint: 已补 `submit-manual`、admin feedback API、project-scoped guard、feedback outbox worker、Prisma migration、focused tests；线上 404 根因已锁定为反馈代码尚未进入当前部署源
- 已通过的验证：
  - `pnpm exec vitest run tests/feedback-minimal-closure.test.mts` → 18/18 ✅
  - `pnpm exec tsc --noEmit --project tsconfig.json --pretty false` → 通过 ✅
  - SRS dev / prd health 200，基础表与 bindings 已就位 ✅
  - Laicai release workflow 与 backend SRS 环境变量已接入 ✅

## Locked Decisions
- shared-runtime-services 是多个业务项目共用的共享运行时服务底座，面向 InfoV、Laicai 与后续活跃项目。
- 当前核心范围是统一 Object Service / Release Service / Shared Delivery Plane；admin-platform 是控制面，不是 runtime 真相源。
- 真相源围绕 projectKey + runtimeEnv + serviceType。
- provider-neutral、delivery plane 与 provider plane 分层是长期核心原则。
- Object Service 通过 ObjectStorageAdapter 抽象与 provider 解耦；CosObjectStorageAdapter 是 Phase 1 默认生产 provider。
- 测试框架：Vitest；命令：pnpm test / pnpm test:watch；类型检查：pnpm typecheck。
- 当前 `.agent/runtime/` 状态层已初始化，项目具备 long-running / autonomous mode 的最小恢复能力。
- `dl-dev.infinex.cn` / `dl.infinex.cn` 的长期角色是环境级共享公共分发入口，不应继续作为单一项目 bucket 的长期别名。
- **存储架构**：所有项目共享 2 个物理桶（dev / prd），按 objectKey 前缀逻辑隔离（`{projectKey}/{env}/...`）。
- **启动自检**：API 启动时验证所有 bindings 都有对应 active manifests，不一致则报警但不阻塞启动。
- **Seed 安全**：seed-projects.ts 执行时先检查 manifests 是否存在，不存在则创建，保证幂等性。

## Next Default Action
1. 先更新 steering 中与 SRS feedback 最小闭环直接相关的文档合同，修正文档与现状漂移
2. 扩 Feedback schema 与 migration：`FeedbackSubmission` / `FeedbackProjectConfig` / `FeedbackIssueOutbox`
3. 新增 `submit-manual` 与 admin feedback API，并接入现有 authPreHandler
4. 在 worker 中增加 feedback outbox loop，统一 GitHub issue 同步
5. 补最小测试并执行 typecheck/test 验证

## Blockers / Watchouts
- 当前主要 watchout：dev 服务器曾因 Docker image / build cache 堆积导致磁盘写满；guardrails 已回绿，但删库重跑后仍需复验长期机制。
- prd 当前 blocker 已明确为 Prisma `P3005`：旧库非空且 migration 历史未 baseline；本轮不走 baseline，按用户授权直接重置 dev + prd 数据库。
- Laicai binding 已切换到共享桶（dev: `shared-storage-dev-1321178972`，prd: `shared-storage-1321178972`），downloadDomain 已配（dev: `origin-dev.infinex.cn`，prd: `origin.infinex.cn`）。
- CDN `origin.infinex.cn` 和 `origin-dev.infinex.cn` 已确认关闭「私有存储桶访问」，回源协议 HTTPS。
- ObjectStorageAdapterFactory 按进程内 cache 复用 adapter；binding 变更后需重启 API。
- Laicai CI workflow 已接入 SRS（`app-release.yml` 已合并 main，`feat/srs-release-integration` 已删除）。旧 workflow（`production-android`、`production-ios`、`auto-release-after-fix`、`preview`）已删除。
- SRS release route 和 delivery resolver 已修复 `prd` env 别名：`VALID_ENVS` 加 `prd`，resolver 自动映射 `prd → prod` 域名。

## Key Files
- `steering/PRD.md`
- `steering/APP_FLOW.md`
- `steering/TECH_STACK.md`
- `steering/BACKEND_STRUCTURE.md`
- `steering/IMPLEMENTATION_PLAN.md`
- `steering/LESSONS_LEARNED.md`
- `steering/TEST_PLAN.md`
- `steering/TEST_CASES.md`
- `steering/PROJECT_RULES.md`
- `prisma/schema.prisma`
- `apps/api/src/index.ts`
- `apps/worker/src/index.ts`
- `packages/object-service/src/adapter.ts`
- `packages/object-service/src/cos-adapter.ts`
- `packages/object-service/src/adapter-factory.ts`
- `packages/project-context/src/resolver.ts`
- `scripts/seed-projects-config.ts`
- `progress.md`

## Update Triggers
Update this file when the active slice, next default action, blockers, or locked decisions change.
Refresh it before archiving a session or before context compaction.

## Resume Checklist
When a new session starts in this repository:
1. Read `IDENTITY.md` — confirm "who am I"
2. Read `SOUL.md` — load behavior guidelines
3. Read `memory/` recent logs — restore short-term context
4. Read `MEMORY.md` — load long-term memory
5. Read `steering/SESSION_CONTEXT.md` — restore runtime state (this file)
6. Read `.agent/runtime/execution-state.json` — load autonomous mode companion
7. Read `steering/IMPLEMENTATION_PLAN.md` — understand current phase/slice
8. Read `steering/TECH_STACK.md` and `steering/BACKEND_STRUCTURE.md` — understand project boundaries
9. Resume from the `Next Default Action` section unless the user gives a higher-priority instruction

## References
- `steering/PRD.md`
- `steering/APP_FLOW.md`
- `steering/TECH_STACK.md`
- `steering/BACKEND_STRUCTURE.md`
- `steering/IMPLEMENTATION_PLAN.md`
- `progress.md`