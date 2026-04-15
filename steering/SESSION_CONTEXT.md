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
- Phase: `shared-delivery-e2e-verification`
- Status: `completed` — 双环境全链路 E2E 验证通过
- Active slice: `shared-delivery-e2e-verification`（已收尾）
- Latest checkpoint: 双环境全链路 E2E 通过（2026-04-15）
- 已通过的验证：
  - prd: `dl.infinex.cn` → SRS 302 → `origin.infinex.cn` CDN → COS shared bucket，SHA256 完整性通过
  - dev: `dl-dev.infinex.cn` → SRS 302 → `origin-dev.infinex.cn` CDN → COS shared-dev bucket，SHA256 完整性通过

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
双环境全链路 E2E 已通过。下一步方向：
1. **Laicai 真实接入**：修改 Laicai CI workflow（`production-android.yml`），将 upload/complete/release 调用指向 SRS，用真实 APK 跑一次完整发布链路。
2. **seed 脚本同步**：把 `scripts/seed-projects-config.ts` 中的 bucket 配置从项目桶（`laicai-storage-*`）更新为共享桶（`shared-storage-*`）。
3. **生产 binding 收敛**：确认 Laicai dev/prd binding 均指向共享桶 + 对应 downloadDomain。
4. **Laicai dev 切片落地**：按 PRD 首条接入边界，在 Laicai 独立分支完成 dev release 主链路全量切换。
5. 如需恢复上下文，先读本文件，再按需读 `progress.md`。

## Blockers / Watchouts
- 当前无 active blocker。
- Laicai binding 已切换到共享桶（dev: `shared-storage-dev-1321178972`，prd: `shared-storage-1321178972`），downloadDomain 已配（dev: `origin-dev.infinex.cn`，prd: `origin.infinex.cn`）。
- CDN `origin.infinex.cn` 和 `origin-dev.infinex.cn` 已确认关闭「私有存储桶访问」，回源协议 HTTPS。
- ObjectStorageAdapterFactory 按进程内 cache 复用 adapter；binding 变更后需重启 API。
- Laicai CI workflow 尚未指向 SRS，仍是旧 COS 直传模式。

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