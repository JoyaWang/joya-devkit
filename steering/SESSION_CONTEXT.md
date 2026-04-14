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
- Phase: `compliance-baseline-and-runtime-stabilization`
- Status: `completed` / `human_gate` — onboarding baseline 已完成，等待下一个 slice 方向选择
- Active slice: `p4-onboarding-and-runtime-stabilization`（已收尾）
- Latest checkpoint: `onboarding-2026-04-13T22-30-00+0800`（passed）
- 已通过的验证：seed-config test (3/3)、root typecheck (passed)、full test suite (138/138)

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
当前 onboarding slice 已完成。下一步方向由 human gate 确认：
1. **Provider migration**：推进 dual-write / backfill 执行层，或进入 Phase 5 首批项目接入准备。
2. **Delivery stabilization**：继续 Release Service / Public Delivery Plane 的稳定性验证。
3. 不要把 InfoV / Laicai 接入任务当作本项目当前 active slice；它们是本项目上线稳定后的下游消费方。
4. 如需恢复上下文，先读 `.agent/runtime/execution-state.json` 确认当前状态，再读本文件的 Next Default Action。

## Blockers / Watchouts
- 当前无 active blocker；onboarding baseline 已收口，autonomous mode 可正常恢复上下文。
- 不要在 autonomous mode 下引入脱离本项目语境的外部任务（如直接把 Laicai 接入方案写成本项目的恢复入口）。
- ObjectStorageAdapterFactory 当前按进程内 cache 复用 adapter；binding 变更后需要重启才能让运行中进程看到新配置。
- 当前已落地 provider migration 骨架（dual-write metadata / read fallback / backfill runner），但尚未在真实生产环境验证。

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