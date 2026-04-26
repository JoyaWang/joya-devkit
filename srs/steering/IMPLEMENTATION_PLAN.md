# 实施计划

## 计划视角（Phase / Slice）

本项目采用 **Phase + Slice** 双层计划结构：
- **Phase**：宏观阶段，对应项目的重大里程碑（如 Phase 0 项目初始化、Phase 1 基础运行骨架、Phase 4 Shared Delivery Plane 等）。
- **Slice**：Phase 内的最小可交付切片，每个 slice 有明确的验收标准和完成边界，便于 autonomous mode 下的增量推进与状态恢复。

当前 Phase 4（Shared Delivery Plane）正在执行多个 slice：
- Slice 1–8：已交付 provider migration 骨架（dual-write metadata / read fallback / backfill runner）。
- **当前 Slice**：`shared-cos-config-closure` — 将 shared object storage runtime 配置收口为 Infisical 环境隔离下的单一 `SHARED_COS_*` 合同。

## 脚本与 CI 编排 Batch 2（2026-04-24）

### 目标
按 `project-scripts-orchestration` 标准收口 SRS deploy / maintenance workflows：GitHub Actions 只做编排，Vault env 生成、远端部署、Docker cleanup 进入项目脚本，避免 workflow 继续维护大段 inline Python / SSH shell。

### 脚本合同
- `scripts/gen-env-runtime.sh`：作为 Vault -> `env.runtime` 的唯一脚本入口，支持本地 `~/.joya/vault/.env` 与 CI `VAULT_TOKEN` 两种模式，并支持 `OUTPUT_PATH` 覆盖输出位置。
- `srs/scripts/deploy-remote-ssh.sh`：作为远端 dev / prod 部署编排入口，保持 `dev -> dev`、`prod -> main` 分支语义，执行 runtime env 校验、Docker build/up、migration、canonical seed、API restart、health check 与 worker status 检查。
- `scripts/docker-cleanup.sh`：作为 Docker cache cleanup 入口，默认清理 image / builder cache，`--full` 额外清理 container / network。

### Workflow 收口
- `.github/workflows/deploy-dev.yml`：Vault fetch 与 SSH deploy 改为调用项目脚本。
- `.github/workflows/deploy.yml`：Vault fetch 与 SSH deploy 改为调用项目脚本，保留 `main` release branch trigger。
- `.github/workflows/dev-maintenance.yml`：不再定时 SSH 登录服务器；定时 Docker cleanup 改由服务器本机 cron 调用 `/opt/joya-governance/bin/joya-devkit-docker-cleanup.sh`，workflow 仅保留手动信息页。

### 非范围
- 不真实 deploy / build / test。
- 不修改业务 env key 合同。
- 不改变 prod release branch 语义。

### 验收标准
- [x] deploy workflows 不再维护 inline Python Vault reader。
- [x] deploy workflows 不再维护大段 inline SSH deploy 逻辑。
- [x] maintenance workflow 不再维护 inline Docker cleanup 逻辑。
- [x] maintenance schedule 不再经 GitHub-hosted runner SSH 登录服务器，改为服务器本机 cron。
- [x] 新增 / 修改脚本通过 `bash -n`。
- [x] workflow YAML 可解析。
- [x] `git diff --check` 通过。

## Shared COS 配置收口（2026-04-24）

### 目标
将 runtime object storage 的 Vault/env -> workflow -> seed -> DB binding 链路收口为单一真相源，消除 workflow inline reader 与 `scripts/seed-projects-config.ts` 分叉。

### 正式配置合同
- **业务 env 唯一 canonical 真相源**：Vault / Infisical Vault。服务器 `.env` / `env.runtime` 只是 Vault 生成的 mirror，不得作为 canonical 来源。
- GitHub Secrets 只保留 Vault bootstrap / SSH bootstrap 用途，不承载业务 env canonical。
- runtime object storage canonical keys 仅为：
  - `SHARED_COS_BUCKET`
  - `SHARED_COS_REGION`
  - `SHARED_COS_SECRET_ID`
  - `SHARED_COS_SECRET_KEY`
  - `SHARED_COS_DOWNLOAD_DOMAIN`
- dev / prod 差异只由 Infisical environment 区分；key 名中不再携带 `DEV` / `PROD`。
- `SHARED_DEV_*`、`SHARED_PROD_*`、`INFOV_*`、`LAICAI_*`、legacy `COS_*` 不再是正式输入源。

### 实施步骤
1. 文档与 `.env.example` 先统一到 `SHARED_COS_*` 合同。
2. `scripts/seed-projects-config.ts` 作为唯一 COS config resolver，仅读取 `SHARED_COS_*`。
3. `scripts/seed-projects.ts` 继续作为 canonical seed 逻辑，幂等写入 manifests 与 bindings。
4. deploy workflows 删除 inline `resolveConfig` / raw SQL seed，改为在 API 容器内执行 canonical seed 入口。
5. API runtime image 必须具备执行 seed 入口所需的脚本、Prisma generated client 与运行时依赖。
6. binding 变更后必须重启 API，因为 `ObjectStorageAdapterFactory` 有进程内 adapter cache。

### 验收标准
- [ ] `resolveObjectStorageSeedConfig()` 只读取 `SHARED_COS_*`。
- [ ] deploy workflows 不再维护第二套 COS env reader。
- [ ] deploy 在 migration 后调用 API 容器内 canonical seed 入口。
- [ ] deploy gate 校验 `SHARED_COS_*` 五个键。
- [ ] seed config tests 只覆盖单一路径，并验证 dev/prod 由不同 env object 表达。

## Existing Project Onboarding

`shared-runtime-services` 自身是共享运行时底座，不是业务接入项目。因此本项目的 onboarding 不是"接入另一个系统"，而是：

1. 补齐项目身份层（IDENTITY.md / SOUL.md）
2. 初始化 `.agent/runtime/` 运行态状态层
3. 重写 `steering/SESSION_CONTEXT.md` 为本项目自身的 runtime baseline 口径
4. 更新 `steering/TEST_PLAN.md` 为真实工具与命令
5. 验证 seed-config 测试修复后无回归

这些工作完成后，本项目才算具备 autonomous mode 的最小恢复能力，才能承接后续 InfoV / Laicai 等下游项目的真实接入任务。

> 注意：InfoV / Laicai 接入是 `shared-runtime-services` 上线稳定后的下游消费方任务，不是本项目当前的 active slice。

## 阶段概述
本项目采用“文档先行 + 模块化单体 + Docker Compose 起步”的方式推进。首期目标不是一次性做全共享平台，而是先把最有复用价值的两块能力做成可运行 MVP：Object Service 与 Release Service；在此基础上，再把共享 Storage 的访问策略与公共分发层补齐。

## 共享服务接入策略
本项目本身就是共享运行时服务，因此不再把 Object / Release 视为外部依赖，而是首期直接实现。

| 能力 | 当前策略 | 目标状态 | 迁移时机 |
|------|----------|----------|---------|
| Object Service | direct | shared runtime core | Phase 1 |
| Release / Update Service | direct | shared runtime core | Phase 1 |
| Shared Delivery Plane | planned | shared runtime core | Phase 4 |
| Feedback / Crash Service | in-progress | shared runtime module | 当前阶段 |
| AI Service Layer | local-first | shared runtime module | 后续阶段 |
| Domain / Certificate Service | local-first | shared runtime module | 后续阶段 |
| Config Center | local-first | shared runtime module | 后续阶段 |

## Phase 0: 项目初始化与文档合同
### 目标
创建项目目录、标准文档合同、mock 目录和本地运行时支持，锁定边界。

### 任务清单
- [x] 创建项目目录 `shared-runtime-services`
- [x] 建立标准根目录文件与 `steering/` 文档合同
- [x] 建立 `mock/fixtures`、`mock/factories`、`mock/repositories`
- [x] 接入 `.claude/settings.json`、`.opencode/plugins/joya-self-evolution.js`、`scripts/agent-evolution/`、`.agent/evolution/`
- [x] 回填 README 与最小项目说明
- [x] 将需求、方案、计划正式写入文档

### 验收标准
- [x] 项目结构完整
- [x] 文档合同齐全
- [x] 可以作为后续实现的标准起点

## Phase 1: 基础运行骨架
### 目标
建立 api / worker / postgres / redis 的最小可运行骨架。

### 任务清单
- [x] 初始化 Node.js + TypeScript 项目
- [x] 建立 Fastify API 服务
- [x] 建立 worker 进程
- [x] 接入 PostgreSQL
- [ ] 接入 Redis（运行时尚未使用）
- [x] 建立 healthcheck / logging / config 基础设施
- [x] 建立 project service token 鉴权中间件
- [x] 建立 ObjectStorageAdapter 抽象与 provider 配置基线
- [x] 建立 Prisma schema 与 migration 机制
- [x] 编写 Docker Compose 基础编排
- [x] 完成生产部署硬化（clean Docker build、Prisma generate、Nginx 反代、GitHub `prod` environment）

### 验收标准
- [x] Docker Compose 可一键启动基础环境（本地使用本地 PostgreSQL）
- [x] `/health` 可用
- [x] API 能连通数据库
- [x] project token 校验可用

## Phase 2: Object Service MVP
### 目标
跑通对象上传、下载、完成登记、删除的闭环。

### 任务清单
- [x] 锁定 `ObjectStorageAdapter` contract 与 objectKey 生成规则
- [x] 实现 `POST /v1/objects/upload-requests`
- [x] 实现 `POST /v1/objects/download-requests`
- [x] 实现 `POST /v1/objects/complete`
- [x] 实现 `DELETE /v1/objects`
- [x] 建立 `objects` 表
- [x] 实现 `CosObjectStorageAdapter` 作为 Phase 1 默认生产 provider
- [x] 预留其他 provider adapter 扩展点
- [x] 设计本地 MinIO adapter / 兼容策略（可选）
- [x] 补齐对象审计日志

### 验收标准
- [x] 可生成上传签名
- [x] 可生成下载签名
- [x] 可登记对象元数据
- [x] 可校验非法 scope
- [x] 可删除合法对象
- [x] Object Service core 只依赖 adapter contract，不直接散落 COS SDK 调用

## Phase 3: Release Service MVP
### 目标
跑通版本登记、版本查询、分发链接真相源和 rollout 控制基础能力。

### 任务清单
- [x] 实现 `POST /v1/releases`
- [x] 实现 `GET /v1/releases/latest`
- [x] 实现 `PATCH /v1/releases/{id}`
- [x] 实现 `GET /v1/releases`
- [x] 建立 `app_releases` 与 `release_channels` 表
- [x] 固化 GitHub Release link-only 规则
- [x] 设计 CI 接入 payload
- [x] 建立 release 审计日志

### 验收标准
- [x] CI 可以写入 release 记录
- [x] App 可以获取最新版本信息
- [x] Android 可返回下载链接
- [x] iOS 可返回 TestFlight 链接
- [x] GitHub Release 不再承担正式二进制分发

## Phase 3.5: 多环境项目资源绑定协议实现
### 目标
建立以 `projectKey + runtimeEnv + serviceType` 为入口的项目协议层，让共享运行时服务能够按项目与运行环境解析 provider 配置与资源绑定，替代当前全局单例 adapter 模式。

### 任务清单
- [x] 为 `project_service_bindings` 新增 `runtime_env` 字段并升级唯一键
- [x] 建立 `ProjectManifest` / `ProjectServiceBinding` 类型与解析器
- [x] 将鉴权真相源升级为 `token -> projectKey + runtimeEnv`
- [x] 建立 `ObjectStorageAdapterFactory`
- [x] 将 `CosObjectStorageAdapter` 保持显式配置驱动，并让 factory 按项目+环境 binding 创建实例
- [x] 将 Object Service 四个路由从模块级 adapter 单例重构为按项目+环境解析 binding + 工厂创建
- [x] 为 `infov` / `laicai` 准备 dev / prod 首批项目 binding 数据
- [x] 补齐单元测试、路由测试和 E2E 验证

### 验收标准
- [x] 不同 `projectKey` / `runtimeEnv` 请求可路由到不同对象存储资源
- [x] 请求体中的 `project` / `env` 只做一致性校验，最终路由真相源来自认证结果
- [x] 未注册项目、未绑定对象存储能力或环境不匹配时返回明确协议错误
- [x] Object Service route 文件不再直接 `new CosObjectStorageAdapter()`
- [x] 全部 build / typecheck / test / E2E 通过

## Phase 3.6: 共享 Storage 策略与分发层合同定稿
### 目标
把共享 Storage Service 从“按项目+环境绑定不同 bucket”的基础能力，升级为“按对象场景决定固定 URL 或签名 URL，并把公共下载出口从单项目 bucket 中解耦”的正式架构合同。

### 任务清单
- [x] 梳理 Laicai 当前正式分发产物与运行时对象的真实存储/下载模式
- [x] 确认 `dl-dev.infinex.cn` / `dl.infinex.cn` 当前仍是 Laicai 项目级 bucket 回源，而不是共享分发层
- [x] 锁定对象场景模型：`release_artifact`、`public_asset`、`public_media`、`private_media`、`private_document`、`internal_archive`
- [x] 锁定访问等级模型：`public-stable`、`private-signed`、`internal-signed`
- [x] 锁定“provider plane 与 delivery plane 分层”的长期架构
- [x] 更新 `shared-runtime-services` 项目合同文档
- [x] 同步 `joya-ai-sys` canonical 文档与共享经验

### 验收标准
- [x] 文档中明确哪些场景走固定 URL、哪些走签名 URL
- [x] 文档中明确 `dl-dev` / `dl` 的长期角色是共享分发入口，而不是单项目 bucket 别名
- [x] 文档中明确 provider-neutral 迁移原则（双写 / 回填 / fallback / 灰度）
- [x] 系统级模板已能把该默认规则传播到后续项目

## Phase 4: Shared Delivery Plane 实施
### 目标
把文档中已锁定的共享 Storage 访问策略真正实现出来，让公共长期分发与受控签名下载在系统中分层落地。

### 任务清单
- [x] 为对象元数据补充 `object_profile`、`access_class` 与必要的 delivery policy 快照字段
- [x] 建立 delivery policy resolver：根据对象场景与运行环境决定稳定 URL 或签名下载策略
- [x] 将 Release Service 的 `distributionUrl` 生成逻辑从“env 直拼”升级为 delivery resolver
- [x] 规划并实现 `dl-dev.infinex.cn` / `dl.infinex.cn` 的共享 origin / gateway 最小路线（当前生产为腾讯 CDN `PathBasedOrigin` 按 shared prefix 回源 `124.222.37.77`，经宿主机 Nginx bridge 进入 SRS）
- [x] 设计 provider 迁移 playbook：双写、回填、读 fallback、灰度切换、回滚与 finalize 阶段合同已写入 steering 文档；后续进入实现与验证
- [x] 补齐策略层测试、契约测试与环境验证脚本

### 当前首切片（2026-04-10 下午）
目标：先把“对象策略元数据 + delivery resolver + Release Service URL 生成收口”做成最小可运行纵切片，不在这一轮同时引入 shared origin / gateway 切换。

微步骤：
1. ✅ 为 `objects` 表补充 `object_profile`、`access_class`，先允许以规则推导默认值，不要求调用方立即显式传入。
2. ✅ 在 Object Service 上传链路中，把当前对象的默认策略写入元数据，避免后续 Release Service 只能靠 `env` 猜链接策略。
3. ✅ 新增 `DeliveryPolicyResolver` 首版：最少支持 `public-stable` -> 环境级稳定 URL、`private-signed` / `internal-signed` -> 非公共稳定 URL 的拒绝语义。
4. ✅ 将 `POST /v1/releases` 的 `distributionUrl` 自动生成从 route 内联 `switch(env)` 改为走 resolver；本轮 Android / desktop release artifact 默认按 `public-stable` 处理。
5. ✅ 先补 RED/GREEN 测试：对象策略默认值、resolver 规则、release 自动生成/拒绝语义；通过后再进入下一轮 shared origin / gateway 迁移。

切片边界：
- 本轮不改 objectKey 结构。
- 本轮不要求业务项目立即上传完整 object profile 参数。
- 本轮不切下载域名回源，只先让服务端策略真相源从“env 直拼”升级为 resolver。

### 当前第三切片（2026-04-10 晚间，已完成）
目标：把 `dl-dev.infinex.cn` / `dl.infinex.cn` 从“文档里的稳定 URL 入口”真正收口成 shared-runtime-services 自己承接的共享分发入口，但先采用最小可运行闭环，不额外引入独立 gateway 容器。

微步骤：
1. 先补 RED 测试：锁定 `public-stable` 对象经 `dl-dev` / `dl` 命中 SRS 公共下载入口时会被重定向到 provider 下载地址，而 `private-signed` / `internal-signed` / deleted / host-env 不匹配对象不能通过该入口访问。
2. 在 API 内新增 host-constrained 公共分发路由：仅匹配 `dl-dev.infinex.cn` / `dl.infinex.cn`，按 wildcard path 读取 `objectKey`。
3. 公共分发路由内部读取对象元数据，校验 `status=active` 且 `accessClass=public-stable`，再根据 `projectKey + runtimeEnv + serviceType` 解析 binding，并通过 provider adapter 生成实际下载地址。
4. 入口层先采用“共享稳定 URL -> SRS -> 302 redirect 到 provider 下载地址”的 redirect-gateway 方式，确保项目侧稳定 URL 合同不再依赖单项目 bucket 别名；后续如需 CDN/缓存/流式代理，再在该入口后继续演进。
5. 更新宿主机 Nginx 示例：`srs.infinex.cn` 继续走 API，`dl-dev.infinex.cn` / `dl.infinex.cn` 也反代到同一 API，由 Host header 触发不同路由。
6. 通过 typecheck、路由测试、以及本地 host header/curl 验证共享分发入口真实可用。

切片边界：
- 本轮不新增独立 gateway container。
- 本轮不引入 CDN / 缓存策略优化。
- 本轮不做项目迁移，只让共享稳定入口先由 SRS 承接。
- 本轮公共入口内部允许通过 provider adapter 生成临时真实下载地址并做 302 redirect，但项目侧和用户侧稳定 URL 合同保持不变。

### 验收标准
- [x] `public-stable` 对象返回稳定公共 URL，且不直接暴露 provider host
- [x] `private-signed` / `internal-signed` 对象继续走签名 URL（通过 resolver 拒绝生成公共 URL）
- [x] `dl-dev` / `dl` 已可在生产中通过 shared objectKey 前缀承接多个项目的共享公共分发入口（当前 `/infov`、`/laicai` 经腾讯 CDN `PathBasedOrigin -> 124.222.37.77 -> Nginx bridge -> SRS`）
- [ ] provider 切换不会迫使业务项目或用户侧修改下载入口合同（仍需补 provider 迁移 playbook 并验证）

### Phase 4 下一默认动作（2026-04-10 深夜）
目标：在 shared delivery plane 已完成最小生产闭环之后，先把 provider-neutral 迁移路径正式定稿，避免后续首批项目接入时再次把 provider 细节泄漏给项目侧。

当前已锁定的迁移阶段：
1. prepare new binding
2. dual-write
3. backfill
4. read fallback
5. gradual cutover
6. rollback
7. finalize / cleanup

下一实施重点：
- 将上述 playbook 逐步落实为对象治理字段、迁移任务模型、fallback 策略与验收脚本
- 结合 InfoV / Laicai 首批接入，选择一条真实 provider 迁移演练路径
- 在未完成实现前，不把“切 binding”冒充为可用迁移方案
- 同时把 provider plane 与 delivery plane 的中期收口方案固化为：`shared-dev/shared-prod` 两个共享 bucket + `origin-dev/origin` 两个共享真实下载出口域名；`dl-dev/dl` 继续保留为稳定公共入口

### Phase 4 第四切片（已完成：迁移真相源骨架）
目标：把 provider-neutral 迁移方案从纯文档升级为“有真相源、可继续扩实现”的工程骨架；本轮仍不真正切第二个 provider，但已经把后续 dual-write / backfill / read fallback 所需的最小数据与读路径接口补齐。

微步骤：
1. [x] RED：先补测试，锁定“对象创建时必须记录当前 binding 真相源”“切 binding 后旧对象仍可通过物理落点记录找到历史 provider”所需的数据模型边界。
2. [x] GREEN：在 Prisma schema 中新增 `object_storage_locations` 与 `storage_migration_jobs`，分别承载物理落点真相源与迁移批次真相源。
3. [x] GREEN：在 `complete` 路径中固化当前 binding/provider 到对象落点记录；新对象成功完成登记后会写入 primary location。
4. [x] GREEN：在 `download-requests` 与 `public-delivery` 路径中引入 `resolveCandidateReadBindings()`；当前先按 active primary location 命中历史 binding，缺失时再 fallback 到当前 resolver binding。
5. [x] REFACTOR：补 focused contract tests，并用 project-level `tsc` 收口类型；为未来继续扩到 dual-write / fallback 保留稳定接口形状。

当前交付结果：
- `objects` 继续作为逻辑对象真相源，`object_storage_locations` 成为“对象实际写入过哪个 binding/provider”的物理真相源。
- `storage_migration_jobs` 已可表达迁移批次的 source binding / target binding / status，为后续双写、回填、切流、回滚保留正式模型。
- `complete` 成功后会写入 primary location，不再只有逻辑对象记录而没有物理落点记录。
- `download-requests` 与 `public-delivery` 已不再把“当前 binding”误当成所有历史对象的唯一物理位置真相源。
- 当前 `resolveCandidateReadBindings()` 仍是最小实现：只返回“active primary location -> resolver fallback”两级候选；真正的多候选排序、dual-write 与 read fallback 执行层仍待下一切片实现。

验收标准：
- [x] 新对象创建后，系统内部可追溯其写入时所命中的 binding/provider
- [x] schema 已具备表达 primary / replica / fallback 物理落点的能力（当前至少已落地 primary location 真相源）
- [x] schema 已具备表达 provider 迁移批次的能力
- [x] 下载路径和公共分发路径不再把“当前 binding”误当成未来所有对象的唯一物理位置真相源
- [x] 本轮不要求真正执行 dual-write 或读 fallback，只要求把后续能力的真相源骨架补出来

验证证据：
- `pnpm exec vitest run tests/public-delivery-route.test.mts tests/download-requests-access-class.test.mts tests/project-context-resolver.test.mts tests/adapter-factory.test.mts tests/object-routes-runtime-env.test.mts`
  - 结果：5 个测试文件 / 37 个测试全部通过
- `pnpm exec tsc --noEmit --project tsconfig.json --pretty false`
  - 结果：通过

下一默认动作：
- 在现有真相源骨架之上继续落实 dual-write / backfill / read fallback 的执行层与验收脚本
- 再选择 InfoV / Laicai 中一条真实链路，作为 provider 迁移演练样板

### Phase 4 第五切片（已完成：multi-candidate read fallback）
目标：让读路径真正消费迁移过程中产生的额外物理落点；在暂不实现完整 dual-write / backfill runner 的前提下，把候选读取从“两级”扩展到“primary -> replica/fallback -> resolver”。

微步骤：
1. [x] RED：先补两条路由 contract test，锁定“primary miss 后命中 active replica/fallback，而不是直接跳 resolver”。
2. [x] GREEN：扩展 `resolveCandidateReadBindings()`，在最新 active primary 之后追加 active `replica` / `fallback` location，并按 `bindingId` 去重。
3. [x] GREEN：保持 `resolveReadableDownloadFromBindings()` 不变，继续统一执行 `getOrCreate -> headObject -> createDownloadRequest`。
4. [x] REFACTOR：补齐测试夹具 `headObject()` contract，并用 project-level `tsc` 收口类型与编译验证。

当前交付结果：
- `resolveCandidateReadBindings()` 当前候选顺序已升级为：latest active primary -> active replica/fallback（按 `createdAt desc`）-> current resolver binding。
- `download-requests` 与 `public-delivery` 已共享这一多候选顺序；当 primary binding 中对象缺失时，会继续尝试 secondary location，而不是直接跳到 resolver binding。
- 候选去重按 `bindingId` 完成，避免 primary / secondary / resolver 指向同一 binding 时重复探测。
- 下载执行层继续统一走 `headObject()` 探测后再 `createDownloadRequest()`；`public-stable` 路径没有退化回 provider 临时签名模拟分支。
- 当所有候选都 miss 时，签名下载与公共分发入口都返回 404，维持既有 contract。

验收标准：
- [x] 读路径支持 `primary -> replica/fallback -> resolver` 的多候选顺序
- [x] `download-requests` 命中 secondary candidate 的 contract 已由自动化测试锁定
- [x] `public-delivery` 命中 secondary candidate 的 contract 已由自动化测试锁定
- [x] 既有 primary 优先、无 location fallback resolver、all miss 返回 404 的行为未回归
- [x] project-level typecheck 通过

验证证据：
- `pnpm exec vitest run tests/download-requests-access-class.test.mts tests/public-delivery-route.test.mts tests/object-routes-runtime-env.test.mts`
  - 结果：3 个测试文件 / 28 个测试全部通过
- `pnpm exec tsc --noEmit --project tsconfig.json --pretty false`
  - 结果：通过

下一默认动作：
- 在现有 multi-candidate read fallback 之上继续实现 dual-write / backfill 执行层
- 选择 InfoV / Laicai 中一条真实链路，把当前读 fallback 放进真实迁移演练

### Phase 4 第六切片（已完成：dual-write 元数据落点）
目标：在暂不实现真实跨 provider 文件双写的前提下，先让写侧知道“当前迁移目标落点是谁”；当存在 active dual-write migration job 时，新对象完成登记后除了 primary location，还会声明一条 target binding 的 secondary location，状态标记为 `pending_backfill`。

微步骤：
1. [x] RED：先补 complete 路由测试，锁定“存在 active dual_write job 时，除 primary 外还要写一条 target replica location”。
2. [x] GREEN：在 `complete` 中查询当前 `projectKey + runtimeEnv + object_storage` 的最新 active dual-write migration job。
3. [x] GREEN：若 job 存在且 `targetBindingId !== current binding.id`，则补写一条 `locationRole=replica`、`status=pending_backfill` 的 location 记录。
4. [x] REFACTOR：保持真实文件写入路径不扩 scope；本轮只落地元数据侧 dual-write，为后续 backfill runner 保留接口与真相源。

当前交付结果：
- `complete` 默认仍会写入 active primary location，既有行为保持不变。
- 当存在 active `dual_write` migration job 时，`complete` 还会额外写入一条指向 `targetBindingId` 的 `replica` location，状态为 `pending_backfill`。
- 这条 secondary location 不是“已经完成物理双写”的声明，而是“目标落点已被声明、等待 backfill/verify”的正式真相源。
- 读侧已有的 multi-candidate fallback 现在可以与写侧目标落点声明衔接，形成“写侧知道目标、读侧能消费目标”的最小迁移闭环。
- 本轮仍不实现真实跨 provider copy；原因是当前 adapter contract 仍无 copy/write API，上游上传路径也仍是直传当前 provider。

验收标准：
- [x] `complete` 在无迁移任务时仍只写 primary location
- [x] `complete` 在 active `dual_write` migration job 存在时，会额外写入 `replica + pending_backfill`
- [x] 新增写侧行为已由自动化测试锁定
- [x] 既有 multi-candidate read fallback 行为未回归
- [x] project-level typecheck 通过

验证证据：
- `pnpm exec vitest run tests/object-routes-runtime-env.test.mts tests/download-requests-access-class.test.mts tests/public-delivery-route.test.mts`
  - 结果：3 个测试文件 / 29 个测试全部通过
- `pnpm exec tsc --noEmit --project tsconfig.json --pretty false`
  - 结果：通过

### Phase 4 第七切片（已完成：backfill runner 最小执行骨架）
目标：在不引入真实跨 provider copy 的前提下，先把 `pending_backfill` location 变成可校验、可推进的状态；worker 侧先具备“扫描 -> 探测 -> promotion”的最小执行骨架。

微步骤：
1. [x] RED：先补 `tests/storage-backfill-runner.test.mts`，锁定三种行为：目标 binding 已有对象时 promotion、目标 binding 尚无对象时保持 pending、object/binding 缺失时 skip。
2. [x] GREEN：新增 `apps/worker/src/backfill-runner.ts`，实现 `runPendingBackfillVerification()`，按 `createdAt asc` 扫描 `replica + pending_backfill`。
3. [x] GREEN：对每条 pending location 通过 target binding adapter 执行 `headObject(objectKey)`；对象存在则把 location 提升为 `active` 并补写 `lastHeadAt/checksumVerifiedAt`，否则仅更新 `lastHeadAt` 并保持 pending。
4. [x] REFACTOR：把 runner 依赖收口为 worker 本地最小 contract，而不是直接通过 tsconfig path 把 `packages/object-service/src/*` 拉进 worker 编译域，确保 `@srs/worker` 自身的 standalone typecheck/build 可通过。

当前交付结果：
- 新增 `runPendingBackfillVerification()`，当前负责“verify/promote”，不负责真实文件 copy。
- runner 只处理 `locationRole=replica` 且 `status=pending_backfill` 的记录；顺序按最早创建的 pending location 先处理。
- 当目标 binding 上对象已存在时，location 会从 `pending_backfill` 升到 `active`，并记录 `lastHeadAt` / `checksumVerifiedAt`。
- 当目标 binding 上对象尚不存在时，location 保持 `pending_backfill`，仅刷新 `lastHeadAt`，为后续 backfill/copy 或再次校验保留状态。
- 当 object 或 binding 查不到时，本轮先归类为 `skipped`，不做激进失败标记。
- `@srs/worker` 现在已能独立完成 `typecheck` 与 `build`；不会再因为引用 workspace package 的 source path 触发 `TS6059 rootDir`。

验收标准：
- [x] pending_backfill location 在 target binding 已有对象时可被 promotion 为 active
- [x] target binding 缺对象时，location 会继续保持 pending 并留下最新探测时间
- [x] object / binding 缺失时 runner 不会误 promotion
- [x] `@srs/worker` standalone typecheck/build 通过
- [x] 既有迁移相关 route tests 与 root typecheck 未回归

验证证据：
- `pnpm exec vitest run tests/storage-backfill-runner.test.mts tests/object-routes-runtime-env.test.mts tests/download-requests-access-class.test.mts tests/public-delivery-route.test.mts`
  - 结果：4 个测试文件 / 32 个测试全部通过
- `pnpm --filter @srs/worker run typecheck`
  - 结果：通过
- `pnpm --filter @srs/worker run build`
  - 结果：通过
- `pnpm exec tsc --noEmit --project tsconfig.json --pretty false`
  - 结果：通过

### Phase 4 第八切片（已完成：backfill runner 接入 worker 调度）
目标：把已经具备 verify/promote 能力的 backfill runner 从“可调用函数”推进成“worker 启动后会真实调度的后台循环”，并补齐容器运行时依赖。

微步骤：
1. [x] RED：先补 `tests/storage-backfill-runner.test.mts`，锁定 worker 启动后会立即执行一次 verify、之后按 interval 重复执行、且同一时间不允许重入并发运行。
2. [x] RED：补 `tests/infra-deployment.test.mts`，锁定 `Dockerfile.worker` 必须复制 `object-service` / `project-context` 等 workspace manifest，避免 worker runtime 缺依赖。
3. [x] GREEN：在 `apps/worker/src/backfill-runner.ts` 增加 `startPendingBackfillVerificationLoop()`，以 interval 驱动 verify/promote runner，并防止上一次未完成时再次启动。
4. [x] GREEN：新增 `apps/worker/src/bootstrap.ts`，在 worker 启动时完成 `.env` 装载、Prisma client 动态加载、`ObjectStorageAdapterFactory` 创建，以及 backfill loop 启动；`apps/worker/src/index.ts` 改为 async startup + graceful shutdown。
5. [x] GREEN：升级 `infra/Dockerfile.worker`，在 builder 阶段构建 worker 所需依赖并复制 Prisma generated client + flat production node_modules 到 runner。
6. [x] REFACTOR：修正新测试中的类型收口问题，并用 worker 子包验证 + root typecheck + 迁移回归测试完成收口。

当前交付结果：
- worker 进程现在启动后会创建 runtime，并默认以 `BACKFILL_VERIFY_INTERVAL_MS`（默认 60_000ms）启动 backfill verify loop。
- loop 会在启动后立即执行一次 verify，之后按 interval 重复执行；如果上一轮 verify 仍在进行，不会并发重入。
- worker 收到 `SIGTERM` / `SIGINT` 时会停止 loop，并断开 Prisma 连接。
- `bootstrap.ts` 通过动态加载 Prisma generated client 避开了 worker 直接静态引用 `apps/api/src/*` 带来的 `TS6059 rootDir` 问题。
- `Dockerfile.worker` 现在已具备 object-service / project-context / Prisma generated client 的运行条件，容器镜像不再只适合 keep-alive skeleton。
- 当前 worker 侧仍然只负责 verify/promote，不负责真实跨 provider copy；这部分仍留给下一阶段决策。

验收标准：
- [x] worker 启动后会立即调度一次 backfill verify
- [x] worker 会按 interval 重复调度 verify/promote runner
- [x] verify 尚未完成时不会启动第二轮并发运行
- [x] `Dockerfile.worker` 已覆盖 worker runtime 所需 workspace 依赖
- [x] `@srs/worker` standalone typecheck/build 通过，且迁移相关回归测试与 root typecheck 未回归

验证证据：
- `pnpm exec vitest run tests/storage-backfill-runner.test.mts tests/infra-deployment.test.mts tests/object-routes-runtime-env.test.mts tests/download-requests-access-class.test.mts tests/public-delivery-route.test.mts`
  - 结果：5 个测试文件 / 66 个测试全部通过
- `pnpm exec tsc --noEmit --project tsconfig.json --pretty false`
  - 结果：通过
- `pnpm --filter @srs/worker run typecheck && pnpm --filter @srs/worker run build`
  - 结果：通过

下一默认动作：
- 优先拿 Laicai 作为第一条真实发布链路接入 shared-runtime-services 的 Release Service / Delivery Plane
- 当前已确认的首接入 MVP 边界为：仅在 Laicai 独立分支内切 `dev` Android release 主链路；release 相关读写一次性全切到 SRS，不做 fallback，不兼容 legacy
- 本轮不扩到用户头像、用户媒体、业务中的发布需求图片、私有文档等非 release 对象域；`prod` 与现网 legacy 下载合同不在本轮范围内
- InfoV 继续保留为第二接入对象；当前发布链路最短阻塞是 Android dev/prod 双产物（flavor）尚未稳定产出，完整 object-storage dev/prod 独立配置来源确认也仍待补
- 若要在线上真实运行 backfill verify loop，仍需重新部署 worker 新版本；现网 legacy `/releases/android/...` 仍维持不迁移、不破坏

### Feedback / Crash Service 最小闭环（2026-04）
目标：让 feedback submission、GitHub issue 同步与 admin 管理动作收口到 shared-runtime-services，结束“业务仓库存 feedback + admin 本地表假管理 + GitHub issue 分散执行”的裂变状态。

当前真实状态：
- [x] `FeedbackSubmission` 已扩到可承接 manual feedback 与 GitHub sync 生命周期的最小字段集
- [x] `FeedbackProjectConfig` / `FeedbackIssueOutbox` 已落地，项目级 GitHub repo 与同步开关已有正式真相源
- [x] SRS 已提供 `submit-manual`、admin feedback API、retry/process-pending、worker outbox loop
- [x] focused tests、worker loop 与基础 typecheck 已完成
- [ ] 仍待完成：fix/verify final-state contract 与与控制面的 live 对齐

任务清单：
- [x] 扩 Feedback schema：在 `FeedbackSubmission` 基础上补 `channel/title/description/attachmentsJson/metadataJson/githubSync*` 等字段
- [x] 将 `FeedbackClientSettings` 收口为项目级 `FeedbackProjectConfig`
- [x] 新增 `FeedbackIssueOutbox`，承接 retry / backoff / process-pending
- [x] 新增公开接口：`POST /v1/feedback/submit-manual`
- [x] 新增 admin 接口：`GET /v1/admin/feedback/submissions`、`GET /v1/admin/feedback/submissions/:id`、`POST /v1/admin/feedback/submissions/:id/retry-github-sync`、`POST /v1/admin/feedback/process-pending`、`PUT /v1/admin/feedback/project-config/:projectKey`
- [x] 补齐 final-state contract：`GET /v1/feedback/submissions`、`POST /v1/feedback/verify-fix`、`POST /v1/admin/feedback/mark-fixed`，以及 `FeedbackSubmission.fixed*/verification/statusHistoryJson` 字段
- [x] 在 worker 中新增 feedback outbox loop，统一执行 GitHub issue create / retry / backoff
- [x] 补 manual feedback 排障元信息合同：`deviceInfo/currentRoute/appVersion/buildNumber/attachments/metadata` 入库、list 回显，并在 GitHub issue body `## Metadata` 输出 parsed `deviceInfo`
- [x] 补最小测试：schema/migration、manual submit、admin list/detail、retry/process-pending、worker success/failure、manual deviceInfo persistence、GitHub issue metadata deviceInfo
- [x] 补控制面 live 验证与 legacy 对账/迁移收尾（2026-04-21：admin-platform `ops_feedback_center` 6 条 action live 验证全部 200；Laicai 4 条 legacy manual feedback 已迁移，CloudBase `feedback` 退化为 compat proxy，`process-pending-feedback.js` 已退役）

验收标准：
- [x] SRS 成为 feedback submission 真相源
- [x] GitHub issue 由 SRS worker 统一执行，不再散落在业务后端或 admin 假状态流转中
- [x] manual feedback 的 `deviceInfo/currentRoute/appVersion/buildNumber/attachments/metadata` 作为 submission / GitHub issue metadata 排障证据链保留，手机型号、平台、系统版本不得丢失
- [x] admin-platform 能通过代理读取 submission 列表/详情、触发 retry/process-pending、更新项目 feedback config
- [x] fix/verify final-state contract 与 live 联调证据补齐
- [x] Laicai legacy 链路完成迁移收尾，不再依赖 CloudBase `feedback` 或 admin 本地 `feedback` 表承载新控制面语义（admin-platform 本地 `feedback` 表 count=0，待 drop；CloudBase `feedback` 集合仅剩已标记 `migrated_to_srs` 的历史记录）

### Laicai 首接入执行边界（2026-04-11 已确认）
目标：在不影响 `prod` 与现网正式链路的前提下，让 Laicai `dev` 的 Android release 主链路在独立分支中完整切到 shared-runtime-services，并故意不保留 `dev` 的 legacy fallback，以便尽早暴露真实接入问题。

补充架构前置结论：
- 本轮 Laicai 接入解决的是“首条真实项目链路接入 shared delivery / provider-neutral contract”，不是一次性完成所有项目的共享 bucket 物理迁移。
- 因此短期现实态允许 Laicai 继续使用项目自有 bucket，只要 `dl-dev` / `dl` 与 provider 下载出口已经分层即可。
- 中期若按最佳实践继续推进，再把 provider plane 收敛到 `shared-dev/shared-prod` 两个共享 bucket，并统一以 `origin-dev.infinex.cn` / `origin.infinex.cn` 作为真实下载出口。
- 迁移完成前，禁止把 `dl-dev` / `dl` 直接回填为 provider 下载域名；它们仍只承担稳定公共入口角色。

任务清单：
- [ ] 在 Laicai 仓库创建独立接入分支，仅面向 `dev` 环境实施
- [ ] 将 `dev` Android release 写侧切到 SRS：`upload request`、`complete`、`release create`
- [ ] 将 `dev` Android release 读侧切到 SRS：`latest release`、`distributionUrl`、下载主路径
- [ ] 验证 `dev` 路径不再依赖 legacy backend 真相源
- [ ] 验证本轮未误扩到用户头像、业务图片/媒体、发布需求图片、私有文档等非 release 对象域
- [ ] 验证 `prod` 与现网 legacy 下载路径未受影响

验收标准：
- [ ] Laicai `dev` Android 发布产物可完成 `upload -> complete -> release create -> latest/distributionUrl 消费` 的闭环
- [ ] `dev` 运行路径无 fallback、无 legacy 兼容分支
- [ ] 问题直接暴露在 SRS 接入链路，而不是被兼容层掩盖
- [ ] `prod` 与现网正式链路不受本轮切片影响
- [ ] `dl-dev` / `dl` 与 provider 下载出口保持分层，不出现 redirect loop
- [ ] 若 binding 配置了 `downloadDomain`，其 host 只承担 provider plane 真实下载出口角色，不复用共享稳定入口

### Phase 4 第九切片（进行中：deploy guardrails 与长期磁盘卫生机制）
目标：把本轮 dev 服务器因 Docker image / build cache 堆积导致磁盘写满的问题，从一次性救火升级为长期机制，确保后续 deploy 不会再因为磁盘被构建垃圾打满而在开头秒死。

微步骤：
1. [ ] 为 dev deploy 增加 preflight guard：输出 `df -h`、`docker system df`、执行可控清理，再次输出剩余空间。
2. [ ] 增加磁盘阈值判断；如果清理后可用空间仍低于阈值，则直接 fail，阻止半程部署。
3. [ ] 去掉 dev 常态化 `--no-cache`；仅在显式强制 rebuild 时才走无缓存构建，避免每次部署都堆新 layer。
4. [ ] 新增服务器本机 cron 维护任务，周期性清理 Docker image / builder cache，并留下清理前后空间证据；GitHub `dev-maintenance.yml` 不再承担定时 SSH 登录。
5. [ ] 收口 migration 语义：将当前 `warn-or-skip` 模糊输出改为明确成功/失败，避免 deploy 假绿。
6. [ ] 对已确认”无保留数据”的 dev / prod 环境执行数据库重置，清空旧 schema 后按当前 Prisma migration 从零重建，正式消除 `P3005` 历史债务。

验收标准：
- [ ] dev deploy 前会打印磁盘与 Docker 占用，并执行前置清理
- [ ] 清理后空间不足时，workflow 会在构建前明确失败，而不是等写日志或构建中途炸掉
- [ ] dev 默认部署不再强制 `--no-cache`
- [ ] 服务器本机 maintenance cron 已建立并可独立执行，GitHub workflow 不再定时 SSH 登录
- [ ] dev / prod 删库重建后，`prisma migrate deploy` 不再报 `P3005`
- [ ] 文档中已明确此机制的触发条件、阈值与证据输出

## Phase 5: 首批项目接入
### 目标
让共享服务真正跑在现有项目上，而不只是文档和空 API。

### 任务清单
- [ ] 为 InfoV 注册 `ProjectManifest` 与 dev / prod 首批共享能力 binding
- [ ] InfoV Object Service dev / prod 协议接入验证
- [ ] InfoV 发布链路接入 Release Service / Delivery Plane
- [ ] 为 Laicai 注册 `ProjectManifest` 与 dev / prod 首批共享能力 binding
- [ ] Laicai Object Service dev / prod 协议接入验证
- [ ] Laicai 发布链路接入 Release Service / Delivery Plane
- [ ] 对比迁移前后的重复逻辑与维护成本
- [ ] 更新接入项目的 `TECH_STACK.md` / `BACKEND_STRUCTURE.md` / `IMPLEMENTATION_PLAN.md`

### 验收标准
- [ ] 至少两个项目共享同一 Object / Release / Delivery 契约
- [ ] 重复签名逻辑、公共下载逻辑和分发真相源不再散落在项目内
- [ ] 接入状态在文档中可见

## Phase 6: 控制面接入与扩展
### 目标
让 admin-platform 成为可视化控制面，并为后续 Feedback / AI / Cert / Config 扩展预留位置。

### 任务清单
- [ ] release 列表与详情查询页
- [ ] rollout / force update 管理页
- [ ] distribution link 管理页
- [ ] 对象元数据与审计页
- [ ] project manifest / per-env binding 管理页
- [ ] feedback submission / admin feedback / GitHub issue sync 最小闭环
- [ ] 评估 Feedback / Crash / AI / Cert / Config 的下一阶段顺序

### 验收标准
- [ ] admin-platform 可作为控制面接入
- [ ] 运行时与控制面边界清晰
- [ ] 后续扩展能力有明确入口和顺序

## 参考文档
- `steering/PROJECT_RULES.md` - 项目特定硬规则
- `steering/PRD.md` - 产品需求
- `steering/TECH_STACK.md` - 技术栈
- `steering/BACKEND_STRUCTURE.md` - 后端边界与共享服务接入
