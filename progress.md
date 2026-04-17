# 项目进度

## 职责
- 本文件是长期进度账本，用于记录里程碑状态、按日期更新日志、已完成事项和长期遗留项。
- 本文件不是默认会话恢复入口；恢复当前工作切片时，先读 `steering/SESSION_CONTEXT.md`。
- 不要在这里重复维护"当前切片 / 下一步 / 恢复清单 / 会话书签"。

## 已完成
- **共享桶 + 共享 CDN origin 双环境全链路 E2E 验证通过**（2026-04-15）：
  - dev 共享桶 `shared-storage-dev-1321178972` + CDN `origin-dev.infinex.cn`
  - prd 共享桶 `shared-storage-1321178972` + CDN `origin.infinex.cn`
  - 双环境链路：upload → COS → complete → release → `dl-dev/dl.infinex.cn` → SRS 302 → `origin-dev/origin.infinex.cn` → COS
  - SHA256 完整性验证通过（上传 = 下载）
  - 根因修复：CDN「私有存储桶访问」关闭后，presigned URL 签名参数不再被 CDN 自身凭据覆盖
  - prd binding 已恢复 `downloadDomain: https://origin.infinex.cn`
- **Laicai 统一 APP Release workflow 接入 SRS 并 E2E 全分支验证通过**（2026-04-15）：
  - 还原 `app-release.yml`（4-job: prepare → build-android / build-ios → release），接入 SRS 全链路
  - 删除旧 workflow：`production-android.yml`、`production-ios.yml`、`auto-release-after-fix.yml`、`preview.yml`
  - E2E 全 4 分支通过：Android dev/prd、iOS dev/prd（upload-request → COS → complete → release register → download verify）
  - 修复 SRS `prd` env 兼容：release route VALID_ENVS 加 `prd`、delivery resolver 自动映射 `prd → prod` 域名
  - Laicai 分支 `feat/srs-release-integration` 已合并 main 并删除
  - dev 共享桶 `shared-storage-dev-1321178972` + CDN `origin-dev.infinex.cn`
  - prd 共享桶 `shared-storage-1321178972` + CDN `origin.infinex.cn`
  - 双环境链路：upload → COS → complete → release → `dl-dev/dl.infinex.cn` → SRS 302 → `origin-dev/origin.infinex.cn` → COS
  - SHA256 完整性验证通过（上传 = 下载）
  - 根因修复：CDN「私有存储桶访问」关闭后，presigned URL 签名参数不再被 CDN 自身凭据覆盖
  - prd binding 已恢复 `downloadDomain: https://origin.infinex.cn`
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
- dev 部署 guardrails 与长期磁盘卫生机制（磁盘阈值检查、前置清理、maintenance workflow、migration fail-fast）
- provider 迁移机制实现（真相源骨架 + multi-candidate read fallback + dual-write 元数据落点已完成；下一步进入 backfill 执行层）
- Phase 5 首批项目接入收口（Laicai 已完成，下一步 InfoV）
- Docker Compose 环境完善（含 Redis）
- admin-platform 的 project manifest / per-env binding 控制面规划

## 接下来
- **长期磁盘卫生机制收口**：验证 dev deploy preflight guard + maintenance workflow，并根据结果微调阈值/清理范围
- **migration 结果收口**：确认 prd/dev migration 输出已经是明确成功/失败，不再出现假绿 warn
- **Laicai 真实 APK 发布验证**：手动触发 `APP Release` workflow，用真实 Flutter 构建 + SRS 全链路发布一次
- **seed 脚本共享桶同步**：把 `scripts/seed-projects-config.ts` bucket 配置从项目桶更新为共享桶
- 将 provider 迁移 playbook 继续落为实现层机制（下一步重点是 backfill 执行层与验收脚本）
- 推进 InfoV 接入共享 Release Service / Delivery Plane
- 在未明确批准前，继续保持 legacy `/releases/android/...` 不迁移、不破坏
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

### 2026-04-16（SRS dev API 修复 + Laicai backend storage E2E 验证通过 + Flutter 前端契约对齐）
- **SRS dev API 500 修复**：根因是 `Dockerfile.api` 将 Prisma generated client 复制到 runner 的 `./src/generated`，但编译后的代码在 `dist/` 目录下执行，解析 imports 时寻找的是 `./dist/generated`。修复方式：增加 `COPY --from=builder /app/apps/api/src/generated ./dist/generated`。
- **SRS dev 容器重启验证**：在 `119.29.221.161` 重新构建并重启 `infra-api-1` 容器，`/health` 返回正常，`upload-requests` 返回真实 COS signed URL。
- **Laicai backend 配置补全**：在 `cloudbaserc.json` 的 `functionDefaultConfig.envVariables` 中补入 `SRS_API_URL`、`SRS_PUBLIC_DOMAIN`、`SRS_SERVICE_TOKEN` 与 `PROJECT_KEY: laicai`；同时更新 `cloudbase/functions/common/srs-client.js`，在 `createUploadRequest` 中显式传入 `project` 和 `env` 字段。
- **Laicai backend storage 全链路 E2E 验证**：通过 CloudBase 函数 `storage` 完成完整闭环测试：
  - `POST /storage/upload-request` → 返回 objectKey + uploadUrl + publicUrl ✅
  - 真实 PUT 文件到 COS signed URL → HTTP 200 ✅
  - `POST /storage/complete` → 返回完成确认 ✅
  - `POST /storage/download-request` → 返回 signed downloadUrl ✅
  - `DELETE /storage/object` → 返回 deleted=true ✅
- **Flutter 前端 storage contract 对齐修复**：
  - `UploadService.getUploadInfo()` 签名已要求 `domain`、`scope`、`size`。
  - `ProfileService.uploadAvatar` 已传入 `domain='member'`, `scope='avatar'`。
  - `ImageUploadWidget` 已传入 `domain='post'`, `scope='attachment'` 并在 `getUploadInfo` 前计算 `size`。
  - `RealNameVerificationScreen`（KYC 身份证上传）已传入 `domain='member'`, `scope='identity'` 并提前计算 `size`。
- **SRS scope 扩展**：为支持 KYC 证件照，在 `packages/object-service/src/scopes.ts` 新增 `identity: ["member"]`，SRS dev 容器已重建重启。
- **运行时产物落点确认**：通过直接 curl SRS dev `upload-requests` 验证，当前 Laicai dev 的 object 写入落点为 `laicai-storage-dev-1321178972`，prd 落点为 `laicai-storage-1321178972`。根因是 `shared-runtime-services/.env` 未配置 `SHARED_DEV_COS_BUCKET` / `SHARED_PRD_COS_BUCKET`，seed 逻辑 fallback 到 `LAICAI_DEV_COS_BUCKET` / `LAICAI_PRD_COS_BUCKET`。若需切到共享桶，需补全 `SHARED_*` 环境变量并重新执行 `seed-projects.ts`。
- **未触碰 production 环境**：全部验证与修复仅针对 dev 环境。

### 2026-04-15（双环境全链路 E2E 验证通过）
- **共享桶切换**：Laicai binding 从项目桶（`laicai-storage-*`）切换到共享桶（`shared-storage-1321178972` / `shared-storage-dev-1321178972`）。
- **CDN origin 配置**：`origin.infinex.cn` → prd 共享桶，`origin-dev.infinex.cn` → dev 共享桶。
- **CDN 修复**：关闭两个 CDN 的「私有存储桶访问」，回源协议改为 HTTPS；修复了 presigned URL 签名被 CDN 自身凭据覆盖导致 `InvalidAccessKeyId` 的问题。
- **`origin-dev.infinex.cn` SSL 证书**：发现并修复证书不匹配（CDN 默认返回 `*.cdn.myqcloud.com` 证书），用户在腾讯云控制台补配正确证书。
- **prd binding downloadDomain 恢复**：测试期间被移除，已恢复为 `https://origin.infinex.cn`。
- **E2E 验证结果**：
  - prd：upload 100KB → COS → complete → release create → `dl.infinex.cn` 302 → `origin.infinex.cn` 200 → SHA256 一致 ✅
  - dev：upload 100KB → COS → complete → release create → `dl-dev.infinex.cn` 302 → `origin-dev.infinex.cn` 200 → SHA256 一致 ✅
- **阶段结论**：Shared Delivery Plane 双环境最小生产闭环已完成；下一步进入 Laicai 真实接入。

### 2026-04-13（夜间 — compliance baseline 与 autonomous runtime onboarding 完成）
- **补齐项目身份层**：`IDENTITY.md`（Salomé 全栈专家角色定位）与 `SOUL.md`（TDD 纪律、文档先行、autonomous mode 协议）已补全内容，与项目定位一致。
- **初始化 autonomous runtime state**：`.agent/runtime/` 目录已创建，包含 `execution-state.json`（mode=autonomous）、`slice-packets/p4-onboarding-and-runtime-stabilization.json`、`checkpoints/onboarding-2026-04-13T22-30-00+0800.json`、`evidence/p4-onboarding-and-runtime-stabilization.json`、`reconcile-log.jsonl`。
- **重写 SESSION_CONTEXT.md**：已从 Laicai 接入口径切回本项目 runtime baseline 口径，新增 `Current Mode: autonomous` 与 `Runtime companion: .agent/runtime/execution-state.json`，并移除 Laicai 接入任务描述。
- **补入 IMPLEMENTATION_PLAN.md 顶部 long-running framing**：加入"计划视角（Phase / Slice）"与"Existing Project Onboarding"段落，解释为什么现在有 `.agent/runtime/` 与当前 onboarding slice。
- **更新 TEST_PLAN.md**：修正"Vitest / Jest 待定"等过时口径为真实工具与命令（`pnpm test` / `pnpm test:watch` / `pnpm typecheck` / `bash scripts/e2e-verify.sh`）。
- **修复 seed-config 测试根因**：RED-GREEN 修复 `tests/seed-projects-config.test.mts`，根因是 `downloadDomain` fallback 逻辑未覆盖"共享 bucket 存在但未显式给出下载域"的场景，修复为 `|| (runtimeEnv !== "prd" ? "https://origin-dev.infinex.cn" : undefined)`。
- **验证结果**：
  - `pnpm exec vitest run tests/seed-projects-config.test.mts tests/object-routes-runtime-env.test.mts tests/adapter-factory.test.mts` -> 3 个测试文件 / 20 个测试全部通过
  - `pnpm exec vitest run` -> 19 个测试文件 / 138 个测试全部通过
  - `pnpm exec tsc --noEmit --project tsconfig.json --pretty false` -> 通过
- 当前 slice `p4-onboarding-and-runtime-stabilization` 已完成，下一步可推进 provider migration / delivery stabilization 方向或 Phase 5 首批项目接入准备。

### 2026-04-11（上午 — Laicai 首接入方案收口，等待独立分支落地）
- 用户已明确要求：先给 Laicai 接入方案，先不动代码；后续会在新会话中继续该任务。
- 本轮已完成 Laicai 当前发布链路与存储真相源梳理：重点读取并分析了 `.github/workflows/app-release.yml`、`backend/cloudbase/functions/storage/cos_storage_provider.js`、`.env.dev.example`、`.env.prod.example`、`ENVIRONMENT_SWITCHING.md`、`docs/dl.infinex.cn-cdn-android-release-setup.md`。
- 初版收口结论：Laicai 可以作为 shared-runtime-services 第一条真实接入链路，且最初建议采用“独立分支接入、先 dev 后 prd、先写侧后读侧、保留旧 backend/workflow 与 legacy 下载链路作为 fallback、验证通过后再合并”的安全策略，目标是不影响现网 App 可用性。
- 本轮未对 Laicai 仓库动代码；下一步若获批准，应先在 Laicai 仓库创建专用分支，再把 Android dev 发布写侧接入 SRS。

### 2026-04-11（上午后段 — Laicai 首接入边界二次收口：仅 dev release 域全量切换）
- 用户进一步明确：Laicai 首接入只切 `dev`，不做 fallback，不兼容 legacy，并且读写一次性全切。
- 经过 MVP 收敛后，正式确认本轮“全量切换”仅覆盖 **Laicai 独立分支中的 `dev` Android release 主链路**，即 release 相关对象域（APK / AAB / 安装包等 `release_artifact`）与 release 真相源的读写闭环：`upload -> complete -> release create -> latest/distributionUrl/download`。
- 同时明确排除：用户头像、用户上传图片/媒体、业务中的发布需求图片、私有文档等非 release 对象域；`prd` 与现网 legacy 下载合同也不在本轮范围内。
- 已同步回写 `steering/PRD.md`、`steering/APP_FLOW.md`、`steering/IMPLEMENTATION_PLAN.md`、`steering/SESSION_CONTEXT.md`，把“只切 dev + 只切 release 域 + 不做 fallback + 不兼容 legacy”的边界固化为当前默认方案。
- 当前状态仍为文档/方案阶段，尚未对 Laicai 仓库动代码；下一步应在 Laicai 仓库创建独立分支，并按上述边界准备实施清单。

### 2026-04-11（早晨 — Phase 4 第八切片完成：backfill runner 接入 worker 调度）
- **worker 调度已真正接线**：`apps/worker/src/index.ts` 现在会在启动时通过 `createWorkerRuntime()` 装配 Prisma / ObjectStorageAdapterFactory / backfill loop；worker 不再只是 keep-alive skeleton。
- **新增 runtime bootstrap**：新增 `apps/worker/src/bootstrap.ts`，内联项目根 `.env` 自动发现逻辑，并通过动态 import 方式加载 Prisma generated client，避免再次把 `apps/api/src/*` 拉进 worker 编译域触发 `TS6059 rootDir`。
- **loop 行为已被测试锁定**：`startPendingBackfillVerificationLoop()` 现在会启动立即跑一次 verify，并按 `BACKFILL_VERIFY_INTERVAL_MS`（默认 60_000ms）重复执行；上一轮未结束时不会并发重入。
- **worker 容器运行条件已补齐**：`infra/Dockerfile.worker` 现在会复制 `packages/object-service/package.json`、`packages/project-context/package.json` 等 workspace manifest，并在 builder 阶段构建 worker 运行所需依赖、Prisma generated client 与 flat production node_modules。
- **这轮仍只做 verify/promote，不做真实 copy**：当前 backfill runner 依然只负责探测 target binding 上对象是否已存在并 promotion `pending_backfill` location；真实跨 provider copy 仍待后续决策。
- **验证收口**：
  - `pnpm exec vitest run tests/storage-backfill-runner.test.mts tests/infra-deployment.test.mts tests/object-routes-runtime-env.test.mts tests/download-requests-access-class.test.mts tests/public-delivery-route.test.mts` -> 5 个测试文件 / 66 个测试全部通过
  - `pnpm exec tsc --noEmit --project tsconfig.json --pretty false` -> 通过
  - `pnpm --filter @srs/worker run typecheck && pnpm --filter @srs/worker run build` -> 通过
- **阶段结论**：provider 迁移机制现在已经具备“写侧声明目标落点 + 读侧多候选消费辅助落点 + worker 侧定时 verify/promote”的最小可运行闭环；下一步应优先拿 Laicai 进入首条真实接入链路，InfoV 作为第二接入对象继续收口双产物构建。

### 2026-04-11（清晨 — Phase 4 第六切片完成：dual-write 元数据落点）
- **写侧继续前推**：在 `complete` 已能写入 primary location 的基础上，本轮补上 dual-write 的元数据侧最小闭环。
- **最小实现边界明确**：当前不做真实跨 provider 文件双写，因为现有 adapter contract 仍无 copy/write API，上传链路也仍是直传当前 provider；本轮只让写侧正式声明目标落点。
- **complete 路由升级**：当存在 active `dual_write` migration job，且 `targetBindingId` 与当前 primary binding 不同，`complete` 除 primary 记录外，还会额外写入一条 `locationRole=replica`、`status=pending_backfill` 的 secondary location。
- **语义收口**：这条 secondary location 表示“目标落点已声明，等待 backfill/verify”，不代表真实文件已经完成双写。
- **回归验证**：
  - `pnpm exec vitest run tests/object-routes-runtime-env.test.mts tests/download-requests-access-class.test.mts tests/public-delivery-route.test.mts` -> 3 个测试文件 / 29 个测试全部通过
  - `pnpm exec tsc --noEmit --project tsconfig.json --pretty false` -> 通过
- **阶段结论**：provider 迁移机制现在已经具备“读侧 multi-candidate fallback + 写侧 dual-write 元数据声明”的最小迁移闭环；下一步应继续补 backfill runner，把 `pending_backfill` 推进到真实可校验状态。

### 2026-04-11（凌晨 — Phase 4 第五切片完成：multi-candidate read fallback）
- **读路径切片继续前推**：在前一轮已落地的 `object_storage_locations` / `storage_migration_jobs` 真相源骨架之上，本轮把 `resolveCandidateReadBindings()` 从“两级候选”扩展为“`primary -> replica/fallback -> resolver`”多候选顺序。
- **统一读执行层保持不变**：`download-requests.ts` 与 `public-delivery.ts` 继续复用统一 helper，执行顺序仍为 `getOrCreate -> headObject -> createDownloadRequest`；只有对象真实存在于当前候选 binding 时才生成下载请求。
- **迁移辅助落点真正可被消费**：当历史 primary binding 中对象缺失时，系统会继续尝试 active `replica` / `fallback` location，而不是直接跳到当前 resolver binding。
- **测试 contract 已升级并锁定**：
  - `tests/download-requests-access-class.test.mts` 新增 secondary candidate 命中场景，锁定签名下载路径会先尝试 replica/fallback。
  - `tests/public-delivery-route.test.mts` 新增同类场景，锁定共享公共分发入口与签名下载路径保持一致的候选顺序。
- **验证结果**：
  - `pnpm exec vitest run tests/download-requests-access-class.test.mts tests/public-delivery-route.test.mts tests/object-routes-runtime-env.test.mts` -> 3 个文件 / 28 个测试全部通过
  - `pnpm exec tsc --noEmit --project tsconfig.json --pretty false` -> 通过
- **阶段结论**：provider 迁移机制现在已经具备“物理落点真相源 + 迁移批次真相源 + multi-candidate read fallback”的最小读侧闭环；下一步应继续补 dual-write / backfill 执行层，而不是重新回到硬切 binding。

### 2026-04-10 (上午 — 共享 Storage 完整方案定稿)
- 基于 Laicai 当前正式分发产物与运行时对象的真实实现，正式确认共享 Storage 不能只停留在“按 `projectKey + runtimeEnv` 路由不同 bucket”，还必须把对象访问策略与公共分发出口分层建模。
- 已将共享 Storage 的长期合同正式写入 `shared-runtime-services/steering/{PRD,APP_FLOW,TECH_STACK,BACKEND_STRUCTURE,IMPLEMENTATION_PLAN,SESSION_CONTEXT}.md`：
  - 对象场景至少 6 类：`release_artifact`、`public_asset`、`public_media`、`private_media`、`private_document`、`internal_archive`
  - 访问等级至少 3 类：`public-stable`、`private-signed`、`internal-signed`
  - `public-stable` 走共享分发层稳定 URL；`private-signed` / `internal-signed` 继续走签名 URL
  - `dl-dev.infinex.cn` / `dl.infinex.cn` 的长期角色定义为环境级共享公共分发入口，不应继续作为单项目 bucket 的长期别名
  - provider plane 与 delivery plane 必须分层，provider 迁移默认采用双写 / 回填 / fallback / 灰度切流
- 同步完成 joya-ai-sys canonical 文档升级：
  - `doc-template/steering/BACKEND_STRUCTURE.md`
  - `doc-template/steering/TECH_STACK.md`
  - `shared_memories/经验教训登记册.md`
- 当前默认下一步已切换到 Phase 4：实现 delivery resolver，并设计 `dl-dev` / `dl` 从单项目 bucket 回源迁移到共享 origin / gateway 的落地方案。

### 2026-04-10 (下午 — Phase 4 首切片完成)
- **Phase 4 首切片完成**：对象策略元数据 + delivery resolver + Release Service distributionUrl 策略化生成，最小可运行纵切片已落地。
- **数据模型补强**：为 `prisma/schema.prisma` 的 `Object` model 新增 `objectProfile` 和 `accessClass` 字段（可选），已生成 Prisma migration。
- **新增 `@srs/delivery-policy` 包**：
  - `DeliveryPolicyResolver`：根据 `env` + `accessClass` + `objectKey` 解析交付策略，只有 `public-stable` 才允许生成环境级稳定 URL
  - `deriveDefaultPolicy`：根据 `domain` + `scope` + 文件元数据推导默认 `objectProfile` 和 `accessClass`，release artifact 默认 `public-stable`，member/avatar 默认 `private-signed`
- **上传链路补强**：`POST /v1/objects/upload-requests` 在写入数据库时自动调用 `deriveDefaultPolicy` 写入策略元数据，不再只写 `visibility: "private"`
- **Release Service 升级**：`POST /v1/releases` 的 `distributionUrl` 自动生成从内联 `switch(env)` 改为调用 `DeliveryPolicyResolver`，release artifact 默认按 `public-stable` 处理
- **测试验证**：
  - 新增 `tests/delivery-resolver.test.mts`：7 个测试全部通过，覆盖 `public-stable` 生成 URL、`private-signed`/`internal-signed` 拒绝生成公共 URL
  - 新增 `tests/object-policy-defaults.test.mts`：2 个测试全部通过，验证 release artifact 默认 `release_artifact` + `public-stable`，member/avatar 默认 `private_media` + `private-signed`
  - 新增 `tests/releases-delivery-resolver.test.mts`：5 个测试全部通过，验证 Release Service 使用 resolver 生成 URL
  - 现有测试全部通过：`npx vitest run` 返回 93 个测试全部通过
- **边界确认**：本轮不改 objectKey 结构，不要求业务项目立即上传完整 object profile 参数，不切下载域名回源，只让服务端策略真相源从 "env 直拼" 升级为 resolver。
- **剩余工作**：`dl-dev` / `dl` 共享 origin/gateway 迁移、provider 迁移 playbook、正式 Prisma migration（当前使用 db push）

### 2026-04-10 (下午后段 — Phase 4 第二切片完成)
- **Phase 4 第二切片完成**：把对象访问策略真相源从“只在 release 创建时假设 `public-stable`”继续收口到下载与 release 两条链路。
- **下载链路升级**：`POST /v1/objects/download-requests` 现在会先读取 `objects.accessClass`，对 `public-stable` 对象直接返回共享稳定 URL；对 `private-signed` / `internal-signed` 对象继续走 `adapter.createDownloadRequest()`，不再把公共下载域名误当成所有对象的统一出口。
- **Release 真相源补强**：`POST /v1/releases` 在未显式传入 `distributionUrl` 且提供 `artifactObjectKey` 时，会优先查询对象元数据中的 `accessClass/objectProfile`；只有对象真相源允许时才自动生成稳定公共 URL，否则保留空字符串。
- **正式 migration 补齐**：新增 `prisma/migrations/20260410_add_object_profile_access_class/migration.sql`，显式固化 `objects.object_profile` 与 `objects.access_class` 字段，替代仅靠 schema/db push 的中间状态。
- **TDD 收口**：先把测试夹具修正为真实 adapter contract（`createDownloadRequest().expiresAt` 为 `string`），再修实现中残留的 `toISOString()` 类型错误。
- **验证结果**：
  - `pnpm typecheck` 通过
  - `pnpm test -- tests/download-requests-access-class.test.mts tests/releases-object-access-class.test.mts` 通过
  - 当前 access-class 分流与对象元数据真相源行为已由自动化测试锁定
- **边界确认**：本轮依然只落地 shared-runtime-services 内部 storage/delivery 能力，不启动项目迁移；下一步继续 shared origin / gateway 切换设计。

### 2026-04-10 (晚间 — Phase 4 第三切片完成，shared storage 最小闭环落地)
- **Phase 4 第三切片完成**：`dl-dev.infinex.cn` / `dl.infinex.cn` 的共享公共分发入口已由 SRS 自己承接，不再停留在文档层假设。
- **新增公共分发路由**：新增 `apps/api/src/routes/public-delivery.ts`，以 Host constraint 只匹配 `dl-dev.infinex.cn` / `dl.infinex.cn`，并使用 wildcard path 读取完整 `objectKey`。
- **公共入口校验逻辑**：该路由会校验 objectKey 格式、对象存在性、对象状态必须为 `active`、访问等级必须为 `public-stable`、且 host 与对象 env 必须匹配（`dl-dev` -> dev/staging，`dl` -> prod）。
- **provider-neutral 解耦方式**：校验通过后，SRS 不直接暴露 provider host 作为稳定合同，而是通过 `object.projectKey + object.env + object_storage binding` 解析 provider adapter，调用 `createDownloadRequest()` 生成真实下载地址，并以 302 redirect 导向 provider 下载 URL。
- **入口层最小实现确认**：本轮没有新增独立 gateway 容器，而是采用“共享稳定 URL -> SRS API -> 302 redirect provider 下载地址”的最小闭环方式；这已经足以把稳定公共入口合同从单项目 bucket 回源中解绑。
- **鉴权边界处理**：在 `apps/api/src/index.ts` 的全局 `preHandler` 中增加 route-level `config.skipAuth` 支持，使公共分发入口可以匿名访问，而已有 API 鉴权边界保持不变。
- **Nginx 示例回填**：更新 `ref-docs/srs.nginx.conf.example`，将 `srs.infinex.cn`、`dl-dev.infinex.cn`、`dl.infinex.cn` 一并反代到 `127.0.0.1:3010`，由 Host header 在 SRS 内部分流。
- **验证结果**：
  - `pnpm test -- tests/public-delivery-route.test.mts` 通过
  - `pnpm test -- tests/public-delivery-route.test.mts tests/download-requests-access-class.test.mts tests/releases-object-access-class.test.mts tests/delivery-resolver.test.mts tests/object-policy-defaults.test.mts tests/releases-delivery-resolver.test.mts` 通过
  - `pnpm typecheck` 通过
- **当前状态结论**：shared storage 服务在代码层已经形成最小闭环；剩余待做的是生产入口层把 `dl-dev` / `dl` 正式反代到 SRS，并完成真实 host 验收。

### 2026-04-10 (深夜后段 — 迁移机制实现切片完成梳理)
- 已对当前代码骨架完成一次迁移机制勘察：`schema.prisma`、`ObjectStorageAdapterFactory`、`download-requests.ts`、`public-delivery.ts` 与 `scripts/e2e-verify.sh` 已足够说明当前系统还没有 provider 迁移所需的物理落点真相源。
- 当前关键差距已明确：
  - `objects` 表只有逻辑对象元数据，没有记录对象最初写入时命中的 binding/provider
  - 下载与公共分发路径都默认把“当前 binding”当作唯一物理位置真相源，不具备 future read fallback 能力
  - 现有 E2E 只验证当前 provider 命中与分发 URL，不验证迁移批次或 fallback 行为
- 因此已正式锁定下一实现切片：
  - 新增物理落点表（如 `object_storage_locations`）
  - 新增迁移批次表（如 `storage_migration_jobs`）
  - 在写入路径固化 primary binding/provider
  - 在读路径补候选位置解析 helper，为 future fallback 留接口
- 结论：下一轮不应直接做“第二 provider 接入”，而应先把迁移真相源骨架补出来；否则未来任何 provider 切换都仍然只能靠硬切 binding。

### 2026-04-10 (深夜 — Provider 迁移 playbook 文档定稿)
- 已将 shared storage 的 provider-neutral 迁移路径正式写入 `steering/PRD.md`、`APP_FLOW.md`、`TECH_STACK.md`、`BACKEND_STRUCTURE.md` 与 `IMPLEMENTATION_PLAN.md`，不再只是口头原则。
- 当前正式锁定的迁移阶段为：`prepare new binding -> dual-write -> backfill -> read fallback -> gradual cutover -> rollback -> finalize / cleanup`。
- 关键约束已明确：
  - 项目侧继续只暴露 `projectKey + runtimeEnv`
  - 用户侧继续使用既有稳定 URL / 签名接口 contract
  - 迁移与回滚都必须收敛在 shared-runtime-services 内部完成，不能要求业务项目发版或用户改链接
- 当前阶段切换结论：shared storage 的下一默认工作重心，已从“入口切流验收”转向“首批项目接入 + 迁移机制实现准备”。

### 2026-04-10 (深夜后段 — Provider 迁移真相源骨架落地并验证完成)
- **Phase 4 第四切片完成**：provider-neutral 迁移机制已从纯文档推进到可扩展的工程骨架。
- **Schema 真相源补齐**：`prisma/schema.prisma` 已新增 `ObjectStorageLocation` 与 `StorageMigrationJob` 两个模型，分别映射到 `object_storage_locations` 与 `storage_migration_jobs`。
- **写路径固化真相源**：`apps/api/src/routes/complete.ts` 在对象完成登记后，会写入 primary storage location，记录 `objectId`、`bindingId`、`provider`、`locationRole=primary`、`status=active`。
- **读路径解除“当前 binding 唯一真相源”假设**：新增 `apps/api/src/routes/read-location-candidates.ts`，并让 `download-requests.ts` 与 `public-delivery.ts` 先尝试使用 active primary location 对应 binding，缺失时才 fallback 到当前 resolver binding。
- **测试 contract 已锁定**：
  - `tests/download-requests-access-class.test.mts` 已覆盖“历史 primary location 优先 / location 缺失 fallback resolver”
  - `tests/public-delivery-route.test.mts` 已覆盖公共分发入口的同类行为
  - `tests/project-context-resolver.test.mts`、`tests/adapter-factory.test.mts`、`tests/object-routes-runtime-env.test.mts` 一并回归通过
- **验证结果**：
  - `pnpm exec vitest run tests/public-delivery-route.test.mts tests/download-requests-access-class.test.mts tests/project-context-resolver.test.mts tests/adapter-factory.test.mts tests/object-routes-runtime-env.test.mts` -> 5 个文件 / 37 个测试全部通过
  - `pnpm exec tsc --noEmit --project tsconfig.json --pretty false` -> 通过
- **阶段结论**：shared storage 现在已经具备“逻辑对象真相源 + 物理落点真相源 + 迁移批次真相源 + 最小候选读位置 helper”的基本骨架；下一步应继续落地 dual-write / backfill / read fallback 执行层，而不是直接硬接第二 provider。

### 2026-04-10 (深夜 — Shared Delivery Plane 生产入口非破坏式切流验收完成)
- 在完成 `public-delivery` 路由、生产数据库 seed、SRS API 上线与宿主机 Nginx bridge 之后，继续对 `dl-dev.infinex.cn` / `dl.infinex.cn` 做真实公网验收，目标是确认 shared objectKey 前缀已经由 SRS 承接，而不是只停留在代码层闭环。
- 最新公网探针结果已确认：
  - `https://dl-dev.infinex.cn/infov/dev/...probe.txt` 返回 `302 Found`，`Server: nginx/1.24.0 (Ubuntu)`，并跳转到 provider 签名下载 URL
  - `https://dl.infinex.cn/infov/prd/...probe.txt` 返回 `302 Found`，`Server: nginx/1.24.0 (Ubuntu)`，并跳转到 provider 签名下载 URL
  - legacy `https://dl-dev.infinex.cn/releases/android/dev/test.apk` 与 `https://dl.infinex.cn/releases/android/prd/test.apk` 仍返回 `Server: tencent-cos` 的 `404 Not Found`
- 这说明当前生产已形成**非破坏式切流**：shared objectKey 前缀（当前 `/infov`、`/laicai`）走 SRS 公共入口，而 legacy `/releases/android/...` 继续保留旧 COS 默认回源，不影响既有链路。
- 在实际验收中还确认了一个关键生产事实：腾讯 CDN `Origin.PathBasedOrigin` 虽可配置为 `Origin=["srs.infinex.cn"]`，但公网行为不稳定；在根因未收口前，当前稳定方案是把 shared 前缀回源固定到 `Origin=["124.222.37.77"]`，再由宿主机 Nginx + `Tencent-Acceleration-Domain-Name` 头桥接到 SRS。
- 当前稳定可用的生产入口合同是：
  - 腾讯 CDN `PathBasedOrigin`：`RuleType=directory`，`RulePaths=["/infov", "/laicai"]`，`Origin=["124.222.37.77"]`
  - `dl-dev` / `dl` 作为环境级共享公共分发入口，命中 `public-stable` 对象时由 SRS 返回 302 到 provider 下载地址
  - legacy `/releases/android/...` 暂不迁移、不破坏
- 阶段结论：shared storage / shared delivery plane 已完成**最小生产闭环**；下一阶段从“入口切流”转向“provider 迁移 playbook + 首批项目接入收口”。

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
