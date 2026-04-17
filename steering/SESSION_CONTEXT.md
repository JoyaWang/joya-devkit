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
- Mode: `autonomous`
- Runtime companion: `.agent/runtime/execution-state.json`

## Current Slice
- Phase: `runtime-stability-and-ops-hardening`
- Status: `in_progress` — SRS prd/dev deploy 已修复到 health 200 + seed complete，但 dev 暴露出 Docker build cache 导致的磁盘打满问题，当前正在收口长期磁盘卫生机制
- Active slice: `dev-disk-hygiene-and-deploy-guardrails`
- Latest checkpoint: `Deploy to Production` 与 `Deploy to Dev` 最新 workflow 均成功（run `24543976024` / `24543976020`），两边都已 `Seed complete` + `/health` 200（2026-04-17）
- 已通过的验证：
  - SRS prd deploy：seed complete → health 200 ✅
  - SRS dev deploy：seed complete → health 200 ✅
  - Laicai backend storage 全链路 E2E: upload-request → COS PUT → complete → download-request → delete ✅

## Locked Decisions
- shared-runtime-services 是多个业务项目共用的共享运行时服务底座，面向 InfoV、Laicai 与后续活跃项目。
- 当前核心范围是统一 Object Service / Release Service / Shared Delivery Plane；admin-platform 是控制面，不是 runtime 真相源。
- 真相源围绕 projectKey + runtimeEnv + serviceType。
- provider-neutral、delivery plane 与 provider plane 分层是长期核心原则。
- Object Service 通过 ObjectStorageAdapter 抽象与 provider 解耦；CosObjectStorageAdapter 是 Phase 1 默认生产 provider。
- 测试框架：Vitest；命令：pnpm test / pnpm test:watch；类型检查：pnpm typecheck。
- 当前 `.agent/runtime/` 状态层已初始化，项目具备 long-running / autonomous mode 的最小恢复能力。
- `dl-dev.infinex.cn` / `dl.infinex.cn` 的长期角色是环境级共享公共分发入口，不应继续作为单一项目 bucket 的长期别名。

## Next Default Action
当前优先级已切到运行稳定性收口。下一步方向：
1. **长期磁盘卫生机制**：为 dev deploy 加入磁盘阈值检查、自动清理、去掉默认 `--no-cache`，并新增定时 maintenance workflow。
2. **migration warning 收口**：把 `Migration skipped or already applied` 的灰区改成明确成功/明确失败，避免假绿。
3. **Laicai/InfoV 后续接入**：在部署与运维 guardrails 稳定后，再继续真实 APK 发布验证与 InfoV 接入。
4. 如需恢复上下文，先读本文件，再按需读 `progress.md`。

## Blockers / Watchouts
- 当前主要 watchout：dev 服务器曾因 Docker image / build cache 堆积导致磁盘写满；虽已通过前置清理恢复，但长期机制仍在补齐。
- 最新 prd/dev deploy 已成功，但 migration 步仍使用 `warn-or-skip` 兜底语义，需要收口成明确成功/失败。
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