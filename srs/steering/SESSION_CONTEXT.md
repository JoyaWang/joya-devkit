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
- Status: **shared COS 配置收口 + dev public ingress 修复完成** — 文档合同、seed resolver、deploy workflow、API runtime seed 入口与 focused 测试已统一到 `SHARED_COS_*`；`dl-dev` 已恢复稳定 302
- Active slice: `shared-cos-config-closure`
- Latest checkpoint: 已确认 Vault 历史漂移真实存在（dev/prod 均缺 `SHARED_COS_*`，且 `LAICAI_COS_BUCKET` 仍指向项目桶）；现已把 `SHARED_COS_*` 写回 Infisical dev/prod，且本地验证 `headBucket` 命中 dev/prod 共享桶成功。同时已完成 `dl-dev` 收口：同一 laicai dev objectKey 现可经公网 `dl-dev` 返回 `302 -> origin-dev`，根因锁定为 shared dev server 缺失 `dl-dev.infinex.cn` Nginx vhost，且 CDN 回源协议 / 端口 / Host 曾未对齐；dev shared server 已新增 `/etc/nginx/sites-available/dl-dev.infinex.cn`，CDN 已收口到 `119.29.221.161:80` + Host `dl-dev.infinex.cn`
- 已通过的验证：
  - `pnpm exec vitest run tests/seed-projects-config.test.mts` → 3/3 ✅
  - `pnpm run build:seed` → 通过 ✅
  - `scripts/check-runtime-env.sh srs/infra/env.runtime`（dev / prod）→ 通过 ✅
  - `SHARED_COS_*` dev/prod `headBucket` → 共享桶存在且可访问 ✅
  - `curl -I https://dl-dev.infinex.cn/{objectKey}` → `302 Found`，`Location: https://origin-dev.infinex.cn/{objectKey}` ✅
  - `curl -I https://origin-dev.infinex.cn/{objectKey}` → `200 OK` ✅
  - `vault SSH -> curl -I -H 'Host: dl-dev.infinex.cn' http://127.0.0.1/{objectKey}` → `302 Found` ✅
  - GitHub Actions `Deploy to Dev` run `24873253269` → `success`，`Deploy via SSH` 通过 ✅
  - `curl https://srs-dev.infinex.cn/health` → `{"status":"ok"...}` ✅

## Locked Decisions
- shared-runtime-services 是多个业务项目共用的共享运行时服务底座，面向 InfoV、Laicai 与后续活跃项目。
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
1. 将 dev shared server 的 `dl-dev.infinex.cn` vhost 与 CDN 回源设置沉淀到 infra baseline / 操作手册，避免手工配置再次漂移
2. 以本次 dev deploy 成功结果为基线，补一次 prod deploy / 抽检，确认 `SHARED_COS_*` canonical seed 闭环双环境一致
3. 根据稳定结果再决定是否清理 Vault 旧 `COS_* / INFOV_* / LAICAI_*` 遗留键
4. 若 `Deploy via SSH` 再次偶发失败，再回捞远端 `deploy.log` 与 Actions step raw log 做根因固化

## Blockers / Watchouts
- 旧 blocker `24868683261 / Deploy via SSH` 已由重跑 `24873253269` 成功暂时解除；当前未复现固定脚本故障，更像一次性环境 / 远端状态波动，后续仍需观察是否偶发。
- 当前主要 watchout：dev 服务器曾因 Docker image / build cache 堆积导致磁盘写满；本次 deploy 成功说明 pre-clean + 构建链路可工作，但仍需继续复验长期机制。
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