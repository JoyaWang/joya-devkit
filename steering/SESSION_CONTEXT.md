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
- Phase: `项目协议层落地完成`
- Status: Object Service 已完成从全局 COS 单例到项目级 binding 解析 + adapter 工厂创建的完整迁移
- Active slice: 项目协议层已落地；下一步推动首批项目真实 COS 凭据接入验证
- Why this slice now: 多项目资源路由架构已定正，Object Service 全链路通过验证

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
- Prisma schema 已新增 `ProjectManifest` 和 `ProjectServiceBinding` 两个 model
- 新增 `packages/project-context/` 包（types + errors + resolver）
- 新增 `packages/object-service/src/adapter-factory.ts`
- 4 个对象路由已从模块级单例重构为 resolver + factory 模式
- 错误语义固定：project_not_registered(422) / project_inactive(403) / service_binding_missing(422)
- 首批 seed 数据已覆盖 infov / laicai / unbound / ghost
- 鉴权方式：Phase 1 使用环境变量 SERVICE_TOKENS 提供 token -> projectKey 映射
- Scope 校验：白名单机制，objectKey 格式不变
- 测试框架：Vitest（35 单元测试）+ E2E 脚本（51 断言）
- Release 默认 rolloutStatus=draft，通过 PATCH 推进
- DELETE /v1/objects 使用软删除
- GitHub Release 只做说明页和外部分发链接
- `admin-platform` 是 Control Plane，不是 Runtime 真相源
- 数据库访问层锁定 Prisma 7
- 关键写操作默认写审计日志

## Next Default Action
1. 推动首批项目（InfoV / Laicai）真实 COS 凭据接入验证
2. Docker Compose 环境完善（含 Redis）
3. Worker 异步任务能力增强
4. Release Service 也切到项目协议层（如果需要按项目分发）
5. admin-platform 集成（项目注册 / binding 管理 UI）

## Blockers / Watchouts
- Docker Compose 中 PostgreSQL 镜像在本地网络环境下拉取很慢（本地开发可直接用本地 PostgreSQL）
- docker-compose.yml 当前不含 gateway
- Redis 尚未实际使用
- 首次 commit 尚未执行

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
- `scripts/e2e-verify.sh` — 端到端 API 验证脚本（51 断言）
- `tests/` — Vitest 单元测试（35 测试）
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
