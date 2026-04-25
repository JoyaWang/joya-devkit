# Project Rules

> Shared rules live in `steering/AI_RULES_BASE.md`.
> This file is for project-specific hard rules only.
> Do not repeat shared workflow rules, generic session rules, or generic doc-governance rules here.

## Project Summary
`joya-devkit` - Joya 统一开发工具库：Flutter SDK + Shared Runtime Services（SRS）。
- 根目录 `steering/` 为 joya-devkit 总合同；`srs/steering/` 为 SRS 模块级合同。
- SRS 面向多个业务项目的共享运行时服务底座。当前核心范围是统一 Object Service、Release Service，并已进入 feedback 收口切片：由 SRS 承接 feedback submission 真相源、GitHub issue 同步执行与 admin control plane 对接后端。

## Scope And Boundaries
- 本项目负责共享运行时 API、共享真相源、对象治理、版本登记与分发链接治理。
- 本项目不负责业务项目自身的领域逻辑与用户状态。
- 本项目不把 `admin-platform` 视作运行时真相源；`admin-platform` 只做控制面。
- Feedback 当前允许实现 **最小闭环**：`submission 真相源 + admin API + outbox/worker + GitHub issue sync`。
- AI / Domain / Config 等其余扩展能力仍维持边界保留，不在本轮范围。

## File And Module Conventions
- `apps/`：运行时入口（api / worker，后续可继续扩成 object-api / release-api / feedback-worker / ai-worker 等）
- `packages/`：模块化共享能力（object-service / release-service / auth / shared-kernel / delivery-policy ...）
- `infra/`：容器编排、迁移、环境基础设施
- `mock/`：跨阶段共享 mock 数据与 mock adapter
- `steering/`：需求、方案、计划与恢复上下文的唯一文档合同

## Coding Rules
- Object 与 Release 相关 contract、鉴权、objectKey 规范必须先写进文档，再实现。
- 数据库 schema 与 migration 基线默认围绕 Prisma 建立，不再在 Phase 1 引入第二套 ORM。
- 对象存储供应商 SDK 只能出现在 adapter 实现层；route / service / domain 层不得直接依赖 COS 专有 API。
- Object Service route / service 不得直接 `new` 具体 provider adapter；adapter 必须通过项目级 binding 解析 + `ObjectStorageAdapterFactory` 创建。
- Object Service 的项目/环境归属真相源来自认证结果中的 `projectKey + runtimeEnv`；请求体里的 `project` / `env` 只做一致性校验，不能自由指定要命中的 bucket。
- 新项目接入共享服务前，必须先注册 `ProjectManifest` 与对应的 `ProjectServiceBinding`，不得靠修改共享服务代码或散落 env 来接入。
- `ProjectServiceBinding` 的正式唯一键为 `projectKey + runtimeEnv + serviceType`，不再把“一个项目一条 object_storage binding”当成长期协议。
- Release Service 中的发布环境 `env` 与 Object Service 的资源绑定 `runtimeEnv` 虽可能取值相同，但语义不同，代码与文档中禁止混用。
- 任何业务项目接入时，不允许把共享服务内部逻辑重新复制回业务仓库。
- 关键写操作默认要求审计日志。

## UX Rules
- 本项目当前不建设独立终端前端；如需控制台页面，默认挂在 `admin-platform`。
- 控制面操作必须通过 shared-runtime-services API，不允许越过服务层直接操作底层资源。

## Operational Rules
- 正式发布二进制不通过 GitHub Release 分发。
- Phase 1 默认使用 Docker Compose 起步。
- 如果后续保留 Supabase，也只能停留在控制面辅助层，不能进入运行时主内核。

## Project-Specific Prohibitions
- 禁止借本轮 feedback 收口之名，顺手扩张到 AI / Cert / Config 等无关模块。
- 禁止把 `admin-platform` 临时逻辑继续膨胀成共享运行时真相源。
- 禁止为省事而在业务项目内复制 COS 签名、release 真相源或 feedback GitHub issue 执行逻辑。

## References
- `steering/AI_RULES_BASE.md` - shared rules
- `steering/PROJECT_RULES.md` - this file
- `steering/LESSONS_LEARNED.md` - project lessons
- `steering/SESSION_CONTEXT.md` - current session recovery context
- `steering/PRD.md` - requirements
- `steering/APP_FLOW.md` - flows
- `steering/TECH_STACK.md` - tech stack
- `steering/FRONTEND_GUIDELINES.md` - frontend rules
- `steering/BACKEND_STRUCTURE.md` - backend rules
- `steering/IMPLEMENTATION_PLAN.md` - implementation plan
- `ref-docs/` - project-specific reference or supplementary documents
