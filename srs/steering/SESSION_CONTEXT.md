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
- Mode: `autonomous`（`.agent/runtime/tasks.json` 已初始化，作为 loop 真相源）
- Runtime companion: `.agent/runtime/tasks.json` 与 `.agent/runtime/deferred-log.jsonl` 已初始化；当前 task packet 先聚焦 `ops_release_register -> SRS` 收口

## Current Slice
- Phase: `shared-delivery-plane`
- Status: **shared COS 配置收口进行中** — 文档合同、seed resolver、deploy workflow、API runtime seed 入口与 focused 测试已统一到 `SHARED_COS_*`
- Active slice: `shared-cos-config-closure`
- Latest checkpoint: 已确认 Vault 历史漂移真实存在（dev/prod 均缺 `SHARED_COS_*`，且 `LAICAI_COS_BUCKET` 仍指向项目桶）；现已把 `SHARED_COS_*` 写回 Infisical dev/prod，且本地验证 `headBucket` 命中 dev/prd 共享桶成功
- 已通过的验证：
  - `pnpm exec vitest run tests/seed-projects-config.test.mts` → 3/3 ✅
  - `pnpm run build:seed` → 通过 ✅
  - `scripts/check-runtime-env.sh srs/infra/env.runtime`（dev / prod）→ 通过 ✅
  - `SHARED_COS_*` dev/prod `headBucket` → 共享桶存在且可访问 ✅

## Locked Decisions
- shared-runtime-services 是多个业务项目共用的共享运行时服务底座，面向 InfoV、Laicai 与后续活跃项目。
- 当前核心范围是统一 Object Service / Release Service / Shared Delivery Plane；admin-platform 是控制面，不是 runtime 真相源。
- 真相源围绕 projectKey + runtimeEnv + serviceType。
- provider-neutral、delivery plane 与 provider plane 分层是长期核心原则。
- Object Service 通过 ObjectStorageAdapter 抽象与 provider 解耦；CosObjectStorageAdapter 是 Phase 1 默认生产 provider。
- 测试框架：Vitest；命令：pnpm test / pnpm test:watch；类型检查：pnpm typecheck。
- `feedback/version 收编到 SRS + admin-platform 退回 control plane + 逐步去 Supabase 化` 的 runtime 已初始化；当前首个自治任务 `ops_release_register -> SRS` 已完成并验收通过。
- `dl-dev.infinex.cn` / `dl.infinex.cn` 的长期角色是环境级共享公共分发入口，不应继续作为单一项目 bucket 的长期别名。
- **存储架构**：所有项目共享 2 个物理桶（dev / prd），按 objectKey 前缀逻辑隔离（`{projectKey}/{env}/...`）。
- **启动自检**：API 启动时验证所有 bindings 都有对应 active manifests，不一致则报警但不阻塞启动。
- **Seed 安全**：seed-projects.ts 执行时先检查 manifests 是否存在，不存在则创建，保证幂等性。

## Next Default Action
1. 触发 dev / prod deploy，使 workflow 使用新 `SHARED_COS_*` + canonical seed 入口重写 `project_service_bindings`
2. deploy 后确认 API 已重启并清空 `ObjectStorageAdapterFactory` cache
3. 复测 `dl-dev.infinex.cn` 真实 objectKey；若仍 404，继续查 `object_storage_locations` 与 `headObject` 链路
4. 再决定是否清理 Vault 旧 `COS_* / INFOV_* / LAICAI_*` 遗留键

## Blockers / Watchouts
- ~~**prd SRS 配置缺失**~~ → **已补齐**（2026-04-21）：`SRS_API_URL=https://srs.infinex.cn`、`SRS_SERVICE_TOKEN=prd-token-laicai`
- 当前主要 watchout：dev 服务器曾因 Docker image / build cache 堆积导致磁盘写满；guardrails 已回绿，但删库重跑后仍需复验长期机制。
- prd 当前 blocker 已明确为 Prisma `P3005`：旧库非空且 migration 历史未 baseline；本轮不走 baseline，按用户授权直接重置 dev + prd 数据库。
- Laicai binding 已切换到共享桶（dev: `shared-storage-dev-1321178972`，prd: `shared-storage-1321178972`），downloadDomain 已配（dev: `origin-dev.infinex.cn`，prd: `origin.infinex.cn`）。
- Runtime object storage canonical env keys 已锁定为 `SHARED_COS_BUCKET / SHARED_COS_REGION / SHARED_COS_SECRET_ID / SHARED_COS_SECRET_KEY / SHARED_COS_DOWNLOAD_DOMAIN`；dev/prd 差异只由 Infisical environment 区分，`SHARED_DEV_*` / `SHARED_PRD_*` / `INFOV_*` / `LAICAI_*` / legacy `COS_*` 不再是 seed 正式输入源。
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
6. If `.agent/runtime/tasks.json` exists, read it first; if `.agent/runtime/deferred-log.jsonl` exists, read latest deferred items
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