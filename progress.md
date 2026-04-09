# 项目进度

## 职责
- 本文件是长期进度账本，用于记录里程碑状态、按日期更新日志、已完成事项和长期遗留项。
- 本文件不是默认会话恢复入口；恢复当前工作切片时，先读 `steering/SESSION_CONTEXT.md`。
- 不要在这里重复维护"当前切片 / 下一步 / 恢复清单 / 会话书签"。

## 已完成
- 新建项目目录：`/Users/joya/JoyaProjects/shared-runtime-services`
- 建立标准根目录入口：`AGENTS.md`、`CLAUDE.md`、`GEMINI.md`、`README.md`、`.gitignore`、`progress.md`
- 建立标准 `steering/` 文档合同
- 建立 `mock/fixtures`、`mock/factories`、`mock/repositories` 与 `mock/README.md`
- 接入项目级 agent 自进化运行时支持：`.claude/settings.json`、`.opencode/plugins/joya-self-evolution.js`、`scripts/agent-evolution/`、`.agent/evolution/`
- 将共享服务项目的需求、方案、技术边界、实施计划写入核心文档
- 锁定对象存储 provider adapter 架构：COS 仅为默认生产 provider，不再把上层 Object Service contract 绑定到单一供应商
- Phase 1 工程骨架已落地：
  - 根目录配置：`package.json`（pnpm 10 锁定）、`pnpm-workspace.yaml`、`tsconfig.base.json`、`.nvmrc`
  - `apps/api`：Fastify 服务，`GET /health` 已验证通过
  - `apps/worker`：最小可启动 worker 入口
  - `packages/object-service`：`ObjectStorageAdapter` 接口 + `CosObjectStorageAdapter` + `MinioObjectStorageAdapter` 占位实现
  - `packages/release-service`：类型与 contract 骨架
  - `packages/auth`：`TokenValidator` 接口与占位实现
  - `packages/shared-kernel`：`Result` 类型、常量、`HealthResponse` 接口
  - `prisma/schema.prisma`：objects / app_releases / release_channels / audit_logs 四表基线
  - `infra/docker-compose.yml`：api / worker / postgres / redis 四服务（不含 gateway）
  - `infra/Dockerfile.api` + `infra/Dockerfile.worker`
  - 全部 typecheck 通过、docker compose config 验证通过、/health 返回 `{"status":"ok"}`
- Prisma 7 基线已建立：
  - 升级到 Prisma 7.7.0，使用 `prisma-client` provider（非旧 `prisma-client-js`）
  - `prisma.config.ts` 配置 datasource URL（Prisma 7 新方式）
  - 使用 `@prisma/adapter-pg` driver adapter
  - Prisma Client 生成到 `apps/api/src/generated/prisma/`
  - 本地 PostgreSQL 创建了 `srs` 用户和数据库，`prisma db push` 成功同步 schema
- Object Service 全部接口已实现并验证通过：
  - `POST /v1/objects/upload-requests`：上传签名申请，含 scope 白名单校验、objectKey 生成、DB 写入、审计日志
  - `POST /v1/objects/download-requests`：下载签名申请，含 objectKey 格式校验、对象存在性与所属项目校验、审计日志
  - `POST /v1/objects/complete`：上传完成登记，含状态流转 pending_upload -> active、可选 size/checksum 更新、审计日志
  - `DELETE /v1/objects`：对象软删除，含状态校验、adapter deleteObject 调用、status=deleted + deletedAt、审计日志
- Release Service 全部接口已实现并验证通过：
  - `POST /v1/releases`：创建 release 记录，含 platform/env 校验、默认 rolloutStatus=draft、审计日志
  - `GET /v1/releases/latest`：查询某项目某平台最新版本，返回 semanticVersion/distributionUrl/forceUpdate/minSupportedVersion/rolloutStatus
  - `GET /v1/releases`：分页列表查询，支持 platform/env 过滤，返回 data + total + limit + offset
  - `PATCH /v1/releases/:releaseId`：更新 rollout 状态/强更开关/最低版本/分发链接，含白名单字段校验、项目归属校验、审计日志
- 审计日志查询接口已实现：
  - `GET /v1/audit-logs`：按 actorId 过滤，支持 action/resourcePrefix 筛选，分页返回
- CosObjectStorageAdapter 已完成增量升级：
  - createUploadRequest：有 COS 凭据时生成真实 signed URL，无凭据时回退 placeholder URL
  - createDownloadRequest：有 COS 凭据时生成真实 signed URL，无凭据时回退 placeholder URL
  - headObject：有 COS 凭据时调用真实 `headObject`，对象不存在时映射为 `exists=false`；无凭据时回退 placeholder
  - deleteObject：有 COS 凭据时调用真实 `deleteObject`；无凭据时回退 placeholder
  - normalizeObjectKey：继续生成符合规范的 provider-neutral objectKey
- 自动化测试已建立并扩展：
  - Vitest 单元测试：21 个测试全部通过（scope 校验、token 校验、COS adapter 真实/回退双模式、API env loader、auth 运行时 env 行为）
  - E2E 验证脚本：44 个断言全部通过（覆盖 health、auth、upload、complete、download、delete、release、audit）
- 工程诊断已处理：
  - CosAdapter 从 placeholder-only 升级为真实 `cos-nodejs-sdk-v5` 集成，保持 fallback 兼容
  - API 启动增加项目根 `.env` 自动发现与加载，避免从 `apps/api` 目录启动时漏掉根配置
  - EnvTokenValidator 改为 validate 时动态读取 `SERVICE_TOKENS`，避免模块初始化过早缓存旧环境值
  - 全部 typecheck / build / test / E2E 通过

## 进行中
- 等待首次 git commit
- 等待首批接入项目（InfoV / Laicai）真实 COS 凭据接入验证

## 接下来
- 首次 git commit 提交所有代码
- 首批项目（InfoV / Laicai）真实 COS 凭据接入验证
- Docker Compose 环境完善（含 Redis）
- Release Service 也切到项目协议层（如需按项目分发）
- admin-platform 集成（项目注册 / binding 管理 UI）

## 长期遗留 / 风险
- admin-platform 与 shared-runtime-services 的控制面 / 运行时接入细节尚未进入实现
- Feedback / Crash、AI、Domain / Certificate、Config 仅停留在边界规划，尚未排入 MVP
- TECH_STACK.md 中 Docker Compose 部分提到了 gateway，但当前 docker-compose.yml 未加入，待后续确认是否需要
- Redis 尚未实际使用（无 Redis 相关运行时代码）
- Docker Compose 中 PostgreSQL 镜像在本地网络环境下拉取慢，当前使用本地 PostgreSQL
- Release Service 尚未切到项目协议层（当前不需要按项目路由不同存储）

## 日期日志
### 2026-04-09 (下午 — 项目协议层落地)
- 完成 Object Service 从全局 COS 单例到项目级 binding 解析 + adapter 工厂创建的完整迁移。
- Prisma schema 新增 `ProjectManifest` 和 `ProjectServiceBinding` 两个 model，数据库同步完成。
- 新增 `packages/project-context/` 包：types（ProjectManifest / ProjectServiceBinding / ProviderConfig 等）、errors（project_not_registered / project_inactive / service_binding_missing）、ProjectContextResolver。
- 重构 `CosObjectStorageAdapter` 为显式配置驱动：新增 `CosProviderConfig` 参数，`options.config` 优先于 env fallback，保留 client 注入能力。
- 新增 `packages/object-service/src/adapter-factory.ts`：`ObjectStorageAdapterFactory`，按 binding 创建 adapter 并按 projectKey:serviceType 缓存。
- 更新 `packages/object-service/src/index.ts`：导出 factory 和新类型。
- 重写 4 个对象路由文件（upload-requests / download-requests / complete / objects-delete）：从模块级 adapter 单例改为 resolver + factory 驱动。
- 更新 `apps/api/src/index.ts`：创建 Prisma-backed resolver 和 factory，传给 4 个 route 注册函数。
- 错误语义固定：project_not_registered(422) / project_inactive(403) / service_binding_missing(422)。
- 新增 seed 脚本 `scripts/seed-projects.ts`：覆盖 infov / laicai / unbound / ghost 四个项目。
- 重写测试：cos-adapter.test.mts（显式配置模式 + env fallback）、project-context-resolver.test.mts、adapter-factory.test.mts。
- 更新 `scripts/e2e-verify.sh`：验证 infov / laicai 命中不同 bucket、unbound 项目报 service_binding_missing、ghost 项目报 project_not_registered。
- 全量验证通过：Vitest 35 tests passed、E2E 51 assertions passed、pnpm build + typecheck 通过。
- 更新 `.env.example`：COS_* 标注为 legacy fallback、新增 SERVICE_TOKENS 完整示例、新增 per-project COS config 占位。

### 2026-04-09 (上午 — COS adapter 增量接入)
- 将 `packages/object-service/src/cos-adapter.ts` 从 placeholder-only 升级为真实 `cos-nodejs-sdk-v5` 集成，并保留无凭据 fallback，确保迁移是配置驱动、非破坏式切换。
- 在 `.env.example` 增补 `COS_SIGN_EXPIRES_SECONDS`，并在本地 `.env` 接入 InfoV 的 COS 配置用于验证。
- 新增 adapter 行为测试、API env loader 测试、auth 运行时 env 测试；当前 Vitest 21 tests passed。
- 新增 `apps/api/src/env.ts`，修复从 `apps/api` 启动时无法自动读取项目根 `.env` 的问题。
- 修复 `EnvTokenValidator` 在构造阶段缓存 `SERVICE_TOKENS` 的问题，改为 validate 时动态读取。
- 完成全量 `pnpm build`、`pnpm typecheck`、`pnpm test`，并以 `BASE_URL=http://localhost:3010 ./scripts/e2e-verify.sh` 完成 44/44 断言通过。

### 2026-04-08
- 创建 `shared-runtime-services` 项目目录与文档合同。
- 明确共享运行时服务主架构：独立项目 + Docker Compose + Fastify + PostgreSQL + Redis。
- 锁定首期范围：Object Service + Release Service。
- 锁定数据库访问层：Prisma。
- 锁定对象存储 provider adapter 架构：默认生产 provider 为 COS，但后续可切换其他对象存储供应商。
- 锁定系统边界：`admin-platform` 只做控制面，GitHub Release 只做 release notes + 外部分发链接。
- 落地 Phase 1 最小工程骨架：pnpm monorepo + Fastify API + worker + ObjectStorageAdapter + Prisma schema + Docker Compose。
- 锁定包管理器：pnpm 10。
- 全部 typecheck 通过，docker compose config 验证通过，/health 端点验证通过。
- git init 完成，尚未提交首次 commit。
- 升级 Prisma 到 7.7.0，适配 Prisma 7 配置方式（prisma.config.ts + driver adapter）。
- 创建本地 PostgreSQL srs 用户和数据库，prisma db push 成功。
- 实现 `POST /v1/objects/upload-requests` 完整链路。
- 实现 `POST /v1/objects/download-requests` 完整链路。
- 实现 `POST /v1/objects/complete` 完整链路。
- 实现 `DELETE /v1/objects` 完整链路。
- 实现 `POST /v1/releases` 完整链路。
- 实现 `GET /v1/releases/latest` 完整链路。
- 实现 `GET /v1/releases` 完整链路。
- 实现 `PATCH /v1/releases/:releaseId` 完整链路。
- 实现 `GET /v1/audit-logs` 查询接口。
- CosObjectStorageAdapter 全部方法补齐 placeholder 实现。
- 建立 Vitest 单元测试（16 tests passed）。
- 建立 E2E 验证脚本（40 assertions passed）。
- 全部 typecheck / build / test 通过。
- MVP 全部 in-scope 接口已实现并验证通过。
- 完成真实 COS adapter 增量接入：接入 `cos-nodejs-sdk-v5`，保留无凭据 fallback，不破坏既有 contract。
- 修复 API 运行时根 `.env` 装载问题，确保从 `apps/api` 启动时也能读取项目根配置。
- 修复 EnvTokenValidator 过早缓存环境变量的问题，避免 service token 在 env 后加载场景下失效。
- 以 `BASE_URL=http://localhost:3010 ./scripts/e2e-verify.sh` 完成全链路验证：44 passed, 0 failed。
