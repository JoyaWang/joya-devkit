# Session Context

## Purpose
Use this file as the only default recovery entry for a new session or after context compaction.
It should stay short and answer:
1. What is this project?
2. Which slice is active right now?
3. What decisions are already locked?
4. What should the agent do next by default?

Do not turn this file into a dated work log. Detailed history belongs in `progress.md`.

## Project Positioning
`shared-runtime-services` 是新的共享运行时服务项目，面向 InfoV、Laicai 与后续活跃项目，统一承载 Object Service 与 Release Service 等跨项目重复能力；`admin-platform` 只作为控制面，不再承载共享运行时真相源。

## Current Slice
- Phase: `生产部署闭环已完成，进入发布收尾`
- Status: `projectKey + runtimeEnv + serviceType` 协议层、本地联调、生产 Docker/Compose、Nginx 反代、TLS 证书与线上健康检查均已闭环；当前需要做的是回填文档、整理热修复经验，并决定是否将未提交的 worker 热修复与测试正式提交到仓库
- Active slice: 回填 `SESSION_CONTEXT.md` / `progress.md` / `LESSONS_LEARNED.md`，保留最新生产状态，并把下一默认动作切到“提交当前热修复或继续推进项目接入”
- Why this slice now: 运行层和入口层都已验证通过，继续保留旧的“部署中”上下文会让后续会话误判当前阻塞

## Locked Decisions
- 新建独立项目 `shared-runtime-services`
- 第一阶段采用 Docker Compose 起步（当前不含 gateway，待后续视需要加入）
- 主栈采用 Node.js 20+ / TypeScript / Fastify / PostgreSQL / Redis
- 包管理器：pnpm 10（已锁定）
- 首期只做 Object Service 与 Release Service
- 对象存储采用 provider adapter 架构，COS 仅作为 Phase 1 默认生产 provider
- `ObjectStorageAdapter` 接口已定义并保持不变
- `CosObjectStorageAdapter` 已重构为显式配置驱动（`CosProviderConfig`），保留 env fallback 和 client 注入
- 项目协议层已实现：`ProjectManifest` / `ProjectServiceBinding` / `ProjectContextResolver` / `ObjectStorageAdapterFactory`
- Prisma schema 已新增 `ProjectManifest` 和 `ProjectServiceBinding` 两个 model，且 `ProjectServiceBinding` 正式唯一键已升级为 `projectKey + runtimeEnv + serviceType`
- 新增 `packages/project-context/` 包（types + errors + resolver）
- 新增 `packages/object-service/src/adapter-factory.ts`
- 4 个对象路由已从模块级单例重构为 resolver + factory 模式，并追加 runtimeEnv 一致性校验
- 错误语义固定：project_not_registered(422) / project_inactive(403) / service_binding_missing(422) / env_mismatch(403)
- 首批 seed 数据已覆盖 infov / laicai / unbound / ghost，且 infov / laicai 已具备 dev / prd 双环境 binding
- Laicai 已确认并验证 dev / prd 使用不同真实 bucket；InfoV 当前仅确认单一 bucket 配置，独立 prd 配置来源待补
- 多环境正式协议已锁定并实现为 `projectKey + runtimeEnv + serviceType`
- 鉴权真相源已从 `SERVICE_TOKENS: token -> projectKey` 升级为 `token -> projectKey:runtimeEnv`
- 请求体中的 `project` / `env` 只做一致性校验，不作为最终资源路由真相源
- Scope 校验：白名单机制，objectKey 格式不变
- 测试框架：Vitest（79 测试）+ E2E 脚本（59 断言）
- Release 默认 rolloutStatus=draft，通过 PATCH 推进
- Release Service 当前仅部分协议化；在真正引入按环境外部分发资源配置之前，暂不强制接入完整项目协议层
- DELETE /v1/objects 使用软删除
- GitHub Release 只做说明页和外部分发链接
- `admin-platform` 是 Control Plane，不是 Runtime 真相源
- 数据库访问层锁定 Prisma 7
- 关键写操作默认写审计日志

## Next Default Action
1. 如果用户要求把当前线上状态固化到仓库，先提交 `apps/worker/src/index.ts`、`tests/worker-lifecycle.test.mts` 与本轮文档回填
2. 继续推进 Phase 4：补齐 InfoV / Laicai 的接入收口与控制面规划
3. 若要继续做生产运维完善，优先处理 `infra/docker-compose.yml` 里的 `version` 过时告警与下载域名 `dl*.infinex.cn` 的正式落地

## Blockers / Watchouts
- Docker Compose 中 PostgreSQL 镜像在本地网络环境下拉取很慢（本地开发可直接用本地 PostgreSQL）
- docker-compose.yml 当前不含 gateway，且仍有 `version` 过时告警
- Redis 尚未实际使用
- InfoV 当前仅发现单一 COS bucket 配置，独立 prd bucket / secret 来源尚未确认；因此 InfoV 的真实 dev / prd 分离验证还不能算完成
- ObjectStorageAdapterFactory 目前按进程内 cache 复用 adapter，binding 变更后需要重启或显式失效缓存才能让运行中进程看到新配置
- 当前服务器已运行包含 worker keep-alive 热修复的代码，但这些变更尚未提交到仓库；后续若再次使用 `git archive HEAD` 同步，必须先提交或显式同步工作区文件

## Key Files
- `steering/PRD.md`
- `steering/TECH_STACK.md`
- `steering/BACKEND_STRUCTURE.md`
- `steering/IMPLEMENTATION_PLAN.md`
- `prisma/schema.prisma` — 数据库 schema（含 ProjectManifest / ProjectServiceBinding）
- `prisma.config.ts` — Prisma 7 配置
- `apps/api/src/index.ts` — API 入口（创建 resolver / factory，传给 route）
- `apps/api/src/auth.ts` — token 校验 middleware
- `apps/api/src/db.ts` — Prisma client 初始化
- `apps/api/src/routes/upload-requests.ts` — 上传签名路由（resolver + factory 驱动）
- `apps/api/src/routes/download-requests.ts` — 下载签名路由（resolver + factory 驱动）
- `apps/api/src/routes/complete.ts` — 上传完成登记路由（resolver + factory 驱动）
- `apps/api/src/routes/objects-delete.ts` — 对象删除路由（resolver + factory 驱动）
- `apps/api/src/routes/releases.ts` — Release Service 全部路由
- `apps/api/src/routes/audit-logs.ts` — 审计日志查询路由
- `packages/auth/src/index.ts` — EnvTokenValidator
- `packages/object-service/src/adapter.ts` — provider-neutral contract
- `packages/object-service/src/cos-adapter.ts` — COS adapter（显式配置驱动）
- `packages/object-service/src/adapter-factory.ts` — adapter 工厂（按 binding 创建 + 缓存）
- `packages/object-service/src/scopes.ts` — scope 白名单与 objectKey 校验
- `packages/project-context/src/types.ts` — 项目协议层类型定义
- `packages/project-context/src/errors.ts` — 项目协议层错误类型
- `packages/project-context/src/resolver.ts` — ProjectContextResolver
- `scripts/seed-projects.ts` — 首批项目 seed 数据
- `scripts/e2e-verify.sh` — 端到端 API 验证脚本（59 断言）
- `tests/` — Vitest 单元与契约测试（79 测试）
- `vitest.config.mts` — Vitest 配置
- `progress.md`

## Update Triggers
Update this file when the active slice, next default action, blockers, or locked decisions change.
Refresh it before archiving a session or before context compaction.

## Resume Checklist
When a new session starts in this repository:
1. Read `steering/SESSION_CONTEXT.md`
2. Read `steering/IMPLEMENTATION_PLAN.md`
3. Read `steering/BACKEND_STRUCTURE.md`
4. Read `steering/TECH_STACK.md`
5. Read `progress.md` only when you need milestone history or dated updates
6. Resume from the `Next Default Action` section unless the user gives a higher-priority instruction

## References
- `steering/PRD.md`
- `steering/APP_FLOW.md`
- `steering/TECH_STACK.md`
- `steering/BACKEND_STRUCTURE.md`
- `steering/IMPLEMENTATION_PLAN.md`
- `progress.md`
