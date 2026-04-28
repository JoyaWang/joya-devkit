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
`joya-devkit` 是 Joya 统一开发工具库：Flutter SDK + Shared Runtime Services（SRS）。
- 根目录 `steering/` 为 joya-devkit 总合同；`srs/steering/` 为 SRS 模块级合同。
- SRS 是多个业务项目共用的共享运行时服务底座，面向 InfoV、Laicai 及后续活跃项目，统一承载 Object Service、Release Service 与 Shared Delivery Plane。`admin-platform` 是控制面，不是 runtime 真相源。真相源围绕 `projectKey + runtimeEnv + serviceType`。

## Current Mode
- Mode: `autonomous`（`.agent/runtime/tasks.json` 已初始化，作为 loop 真相源）
- Runtime companion: `.agent/runtime/tasks.json` 与 `.agent/runtime/deferred-log.jsonl` 已初始化；当前 task packet 先聚焦 `ops_release_register -> SRS` 收口

## Current Slice
- Phase: `shared-delivery-plane`
- Status: **SRS legal docs seed/deploy/content 已闭环** — `/v1/legal/user-agreement|privacy-policy?projectKey=infov|laicai` 已从 404 变为 200；InfoV 用户协议/隐私政策正文已清除 Laicai 的“邻里/闲置共享/交易/地图/个推/人情分”等业务残留。
- Active slice: `legal-docs-prod-verified`
- Latest checkpoint: `seed-legal-docs.ts` runtime path resolver、deploy seed contract、InfoV content adapter 与 `tests/seed-legal-docs.test.mts` 均已提交、推送、部署并线上复验通过；CNB prod deploy `cnb-rt3-1jna66ljp` 关闭 404，`cnb-ote-1jna7iq52` 关闭 InfoV 文案残留。
- 已通过的验证：
  - `pnpm run build:seed` → 通过 ✅
  - `pnpm run typecheck` → 通过 ✅
  - `pnpm run build` → 通过 ✅
  - `pnpm exec vitest run tests/infra-deployment.test.mts -t "SRS legal document seed deployment contract|MUST run legal document seed"` → 6 tests ✅
  - `pnpm exec vitest run tests/seed-legal-docs.test.mts` → 2 tests ✅
  - `git diff --check` → 通过 ✅
  - 全量 `tests/infra-deployment.test.mts` 仍有 12 个历史失败，均属既存 GitHub workflow / docker-compose / `.dockerignore` 合同漂移，不属于本次 legal seed 新增合同；本次新增 legal seed 合同已全部通过。

## Locked Decisions
- joya-devkit 是 Joya 统一开发工具库：Flutter SDK + Shared Runtime Services（SRS）。
- SRS 是多个业务项目共用的共享运行时服务底座，面向 InfoV、Laicai 与后续活跃项目。
- 当前核心范围是统一 Object Service / Release Service / Shared Delivery Plane；admin-platform 是控制面，不是 runtime 真相源。
- 真相源围绕 projectKey + runtimeEnv + serviceType。
- provider-neutral、delivery plane 与 provider plane 分层是长期核心原则。
- Object Service 通过 ObjectStorageAdapter 抽象与 provider 解耦；CosObjectStorageAdapter 是 Phase 1 默认生产 provider。
- 测试框架：Vitest；命令：pnpm test / pnpm test:watch；类型检查：pnpm typecheck。
- `feedback/version 收编到 SRS + admin-platform 退回 control plane + 逐步去 Supabase 化` 的 runtime 已初始化；当前首个自治任务 `ops_release_register -> SRS` 已完成并验收通过。
- `dl-dev.infinex.cn` / `dl.infinex.cn` 的长期角色是环境级共享公共分发入口，不应继续作为单一项目 bucket 的长期别名。
- **存储架构**：所有项目共享 2 个物理桶（dev / prod），按 objectKey 前缀逻辑隔离（`{projectKey}/{env}/...`）。
- **启动自检**：API 启动时验证所有 bindings 都有对应 active manifests，不一致则报警但不阻塞启动。
- **Seed 安全**：seed-projects.ts 执行时先检查 manifests 是否存在，不存在则创建，保证幂等性。

## Next Default Action
1. 回到 InfoV prod iOS local-run，点击登录/注册页协议，确认 WebView 展示 SRS legal 正文。
2. 再恢复原 shared delivery plane 后续或 InfoV T-004 screenshot detector QA 验证。

## Blockers / Watchouts
- prod legal URLs 已闭环：InfoV / Laicai 四个 URL 均 200，InfoV 正文已清除 Laicai 业务残留；下一步只需在 InfoV 真机 WebView 复看展示效果。
- `VersionCheck 401` 已关闭；后续若再出现 release check 401，优先检查 prod 是否运行最新 SRS API，以及 route-level `config.skipAuth` 是否被全局 preHandler 正确读取。
- 旧 blocker `24868683261 / Deploy via SSH` 已由重跑 `24873253269` 成功暂时解除；当前未复现固定脚本故障，更像一次性环境 / 远端状态波动，后续仍需观察是否偶发。
- 当前主要 watchout：dev 服务器曾因 Docker image / build cache 堆积导致磁盘写满；本次 deploy 成功说明 pre-clean + 构建链路可工作。定时 Docker cleanup 已从 GitHub-hosted runner SSH 改为服务器本机 cron：`/opt/joya-governance/bin/joya-devkit-docker-cleanup.sh`。
- 当前主要 watchout：`dl-dev` 现阶段依赖 CDN 回源 `119.29.221.161:80` + Host `dl-dev.infinex.cn`；若要切回 HTTPS 回源，需先补源站 `dl-dev.infinex.cn` 证书。
- Laicai binding 已切换到共享桶（dev: `shared-storage-dev-1321178972`，prod: `shared-storage-1321178972`），downloadDomain 已配（dev: `origin-dev.infinex.cn`，prod: `origin.infinex.cn`）。
- Runtime object storage canonical env keys 已锁定为 `SHARED_COS_BUCKET / SHARED_COS_REGION / SHARED_COS_SECRET_ID / SHARED_COS_SECRET_KEY / SHARED_COS_DOWNLOAD_DOMAIN`；dev/prod 差异只由 Infisical environment 区分，`SHARED_DEV_*` / `SHARED_PRD_*` / `INFOV_*` / `LAICAI_*` / legacy `COS_*` 不再是 seed 正式输入源。
- CDN `origin.infinex.cn` 和 `origin-dev.infinex.cn` 已确认关闭「私有存储桶访问」，回源协议 HTTPS。
- ObjectStorageAdapterFactory 按进程内 cache 复用 adapter；binding 变更后需重启 API。
- Laicai CI workflow 已接入 SRS（`app-release.yml` 已合并 main，`feat/srs-release-integration` 已删除）。旧 workflow（`production-android`、`production-ios`、`auto-release-after-fix`、`preview`）已删除。
- SRS release route 和 delivery resolver 已修复 `prod` env 兼容：`VALID_ENVS` 包含 `prod`，resolver 自动映射环境别名到对应域名。

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