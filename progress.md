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
- 多环境资源绑定协议已正式落地并验证通过：
  - `AuthResult` / `EnvTokenValidator` / Fastify request 上下文已升级为 `projectKey + runtimeEnv`
  - `ProjectServiceBinding` 类型、resolver 查询键、factory cache key 全部升级到 `projectKey + runtimeEnv + serviceType`
  - Object Service 四个路由已增加 `env_mismatch` 拒绝逻辑，请求体与 objectKey 里的环境都必须与认证环境一致
  - `prisma/schema.prisma` 已将 `project_service_bindings` 升级为 `runtime_env` + 新唯一键
  - `scripts/seed-projects.ts`、`.env.example`、本地 `.env`、E2E 脚本已升级为 dev / prd 双环境协议
  - Vitest 全量 79 tests passed，增强版 E2E 59 assertions passed
- 生产部署闭环已完成：
  - 服务器 `124.222.37.77` 上的 `infra-api-1` 与 `infra-worker-1` 均稳定运行
  - Nginx 已新增 `srs.infinex.cn -> 127.0.0.1:3010` 反代
  - 现有 Let’s Encrypt 证书已扩展到 `srs.infinex.cn`
  - `https://srs.infinex.cn/health` 已验证返回 `{"status":"ok"}`

## 进行中
- Docker Compose 环境完善（含 Redis）
- 为本轮 `runtime_env` 协议升级补正式 Prisma migration，替代手工增量 SQL
- admin-platform 的 project manifest / per-env binding 控制面规划
- InfoV 独立 prd 对象存储配置来源待补齐（当前只发现单一 COS bucket 配置）

## 接下来
- 优先补正式 Prisma migration，固化 `project_service_bindings.runtime_env` 升级路径
- 推进 InfoV 独立 prd bucket / secret 配置进入真相源，再补一轮真实 dev/prd 分离验证
- Docker Compose 环境完善（含 Redis）
- Worker 异步任务能力增强
- admin-platform 集成（项目注册 / binding 管理 UI）

## 长期遗留 / 风险
- admin-platform 与 shared-runtime-services 的控制面 / 运行时接入细节尚未进入实现
- Feedback / Crash、AI、Domain / Certificate、Config 仅停留在边界规划，尚未排入 MVP
- TECH_STACK.md 中 Docker Compose 部分提到了 gateway，但当前 docker-compose.yml 未加入，待后续确认是否需要
- Redis 尚未实际使用（无 Redis 相关运行时代码）
- Docker Compose 中 PostgreSQL 镜像在本地网络环境下拉取慢，当前使用本地 PostgreSQL
- Release Service 仅部分协议化；当前建议延后到真正引入外部分发资源配置时再接入项目协议层

## 日期日志
### 2026-04-10 (凌晨 — 生产部署闭环完成)
- 远端生产重建后，`infra-api-1` 已恢复健康，但 `infra-worker-1` 持续 `Restarting (0)`；进一步检查 `docker inspect` 发现 worker 以 `exit=0` 快速退出，不是 crash，而是进程启动后没有保持事件循环活跃。
- 按 TDD 新增 `tests/worker-lifecycle.test.mts`，先让“worker 启动 2 秒内不应退出 / SIGTERM 应优雅退出”失败，再对 `apps/worker/src/index.ts` 做最小热修复：增加 keep-alive `setInterval`，并在 shutdown 时 `clearInterval`。
- 新增验证结果：`pnpm test -- tests/worker-lifecycle.test.mts` 通过、`pnpm typecheck` 通过；worker 生命周期行为被锁定。
- 部署阶段踩到一个真实交付坑：`git archive HEAD` 只会同步已提交内容，未提交的 worker 热修复不会进服务器；因此本轮改为显式 `scp` 同步工作区中的 `apps/worker/src/index.ts` 与测试文件，再重建 worker。
- 远端最终状态：`infra-api-1` 与 `infra-worker-1` 均稳定 `Up`，`curl http://127.0.0.1:3010/health` 返回 `{"status":"ok"}`。
- 入口层闭环：已在服务器新增 `/etc/nginx/sites-available/srs.infinex.cn`，将 `srs.infinex.cn -> 127.0.0.1:3010` 反代到 SRS；随后通过 `certbot --nginx --expand --cert-name infinex.cn ... -d srs.infinex.cn` 将新域名加入现有证书。
- 线上验证结果：`curl -fsS -H 'Host: srs.infinex.cn' http://124.222.37.77/health` 返回 `{"status":"ok"}`，`curl -fsS https://srs.infinex.cn/health` 也返回 `{"status":"ok"}`，说明 Docker / Compose / Nginx / TLS / Cloudflare 全链路已闭环。
- 当前注意事项：worker keep-alive 热修复和对应测试仍处于本地未提交状态，但服务器已运行这版代码；下次若继续用归档同步，必须先提交或显式同步工作区文件。

### 2026-04-09 (深夜收尾 — Laicai prd 真实分桶验证 & Release 评估)
- 从 `Laicai/backend/.env.dev.example`、`.env.prod.example` 与 `ENVIRONMENT_SWITCHING.md` 确认 Laicai dev / prd 应使用不同 COS bucket；prod 模板 bucket 为 `laicai-storage-1321178972`。
- 将 `shared-runtime-services/.env` 中 `LAICAI_PRD_COS_BUCKET` 切到真实 prd 桶名，重新执行 `pnpm exec tsx scripts/seed-projects.ts` 成功。
- 首次 E2E 58/59 失败，根因不是协议错误，而是运行中的 API 进程继续持有旧 `ObjectStorageAdapterFactory` cache；显式以 `PORT=3010 pnpm dev:api` 重启后，增强版 E2E 59/59 通过。
- 当前验证结论：Laicai 已完成真实 dev / prd 分桶路由验证；InfoV 目前仅发现单一 `infov-storage-1321178972` 配置，尚未发现独立 prd bucket 配置来源。
- Release Service 评估结论：当前只算“部分协议化”（`projectKey` 真相源已接入，`runtimeEnv` / binding 未接入）；现阶段建议延后到真正需要外部分发资源配置时再升级到完整项目协议层。

### 2026-04-09 (深夜 — 多环境协议文档升级)
- 用户确认共享运行时正式协议需从 `projectKey + serviceType` 升级为 `projectKey + runtimeEnv + serviceType`，以覆盖同一项目 dev / prd 不同 bucket 的真实生产形态。
- 已完成 joya-ai-sys canonical 文档升级：`doc-template/steering/{AI_RULES_BASE,BACKEND_STRUCTURE,TECH_STACK,IMPLEMENTATION_PLAN}.md`、`skills/{delivery-execution,project-bootstrap,preview-release}/SKILL.md`、`shared_memories/经验教训登记册.md`。
- 已完成 `shared-runtime-services` 项目合同升级：`steering/{PRD,TECH_STACK,BACKEND_STRUCTURE,IMPLEMENTATION_PLAN,PROJECT_RULES,SESSION_CONTEXT,LESSONS_LEARNED}.md` 已统一改为多环境 binding 协议。
- 正式锁定：调用方只暴露 `projectKey + runtimeEnv`；鉴权真相源升级为 `token -> projectKey:runtimeEnv`；`ProjectServiceBinding` 正式唯一键升级为 `projectKey + runtimeEnv + serviceType`；请求体 `project` / `env` 仅作一致性校验。
- 下一步进入 TDD 改造：schema、auth、resolver、factory、object routes、seed、`.env.example` 与 E2E。

### 2026-04-09 (深夜后段 — 多环境协议实现与验证闭环)
- 按 TDD 完成 auth / resolver / adapter factory / object routes 的多环境协议改造，并新增 route 级 runtimeEnv 一致性测试。
- `SERVICE_TOKENS` 正式升级为 `token=projectKey:runtimeEnv` 形式；`AuthResult` 与 Fastify request 均携带 `runtimeEnv`。
- `ProjectServiceBinding` 与 Prisma schema 升级为 `runtime_env` 列与 `projectKey + runtimeEnv + serviceType` 唯一键。
- `scripts/seed-projects.ts` 升级为 infov / laicai 的 dev / prd 双环境 binding seed；`.env.example` 与本地 `.env` 已同步为 env-aware 协议示例。
- 由于本地数据库已有旧数据，未使用 destructive reset，而是先增量补列、把旧 binding 安全回填为 `dev`，再切换唯一键，保证迁移过程非破坏。
- 验证结果：`pnpm build` 通过、`pnpm typecheck` 通过、`pnpm test` 通过（42 tests）、增强版 `scripts/e2e-verify.sh` 通过（59 passed, 0 failed）。

### 2026-04-09 (晚间 — 真实 COS 凭据接入验证闭环)
- 修复 `tests/api-env-loader.test.mts` 测试隔离问题：`dotenv.config({ override: false })` 不会覆盖外部已注入的 `SERVICE_TOKENS`，导致断言失败。修复方式为在测试内部调用 `loadProjectEnv` 前先 `delete process.env.SERVICE_TOKENS`。
- 更新 `scripts/e2e-verify.sh`：将 InfoV / Laicai bucket 断言改为读取 `EXPECTED_INFOV_BUCKET` / `EXPECTED_LAICAI_BUCKET` 环境变量，并保留对 placeholder dev bucket 的 fallback，避免把真实 bucket 写死进仓库。
- 本地 `.env` 已补齐并校正首批项目真实 COS 配置输入；InfoV 命中 `infov-storage-1321178972`，Laicai 命中 `laicai-storage-dev-1321178972`。
- 重新执行 `pnpm typecheck`、`pnpm test`、`pnpm exec tsx scripts/seed-projects.ts`，均通过。
- 使用真实 COS 凭据执行 e2e 验证：InfoV / Laicai 两个项目都命中真实 bucket，51 个断言全部通过。
- 真实 COS 凭据接入验证闭环完成。

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
