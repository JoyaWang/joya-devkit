# 后端结构

## 架构概述
`shared-runtime-services` 是多个业务项目共用的 Runtime Layer，用于承载对象存储、版本发布与分发链接等跨项目重复能力。首期采用模块化单体（modular monolith）方式实现，以降低部署和演进复杂度。

当前已落地的核心是：
- 项目协议层（`projectKey + runtimeEnv + serviceType`）
- provider-neutral 的对象存储适配层
- Object Service / Release Service 真相源
- Feedback submission / admin API / outbox worker 真相源
- 生产部署与基础健康检查

当前新增锁定方向（2026-04）：
- Feedback / Crash 能力不再长期停留在业务仓库 local-first；feedback submission 真相源与 GitHub issue 执行权收口到 SRS
- admin-platform 只作为 feedback control plane / viewer，通过代理调用 SRS admin feedback API
- Laicai 旧 CloudBase feedback 链路先做过渡兼容，再逐步把提交入口与存储权切到 SRS
- 本轮最小闭环仅覆盖：manual feedback submission、project-level feedback config、GitHub issue outbox/worker、admin list/detail/retry/process-pending
- SRS feedback final-state contract 额外补齐 user-facing `GET /v1/feedback/submissions`、`POST /v1/feedback/verify-fix` 与 admin `POST /v1/admin/feedback/mark-fixed`，由 SRS 直接承接 fix/verification 生命周期真相源

当前新锁定的方向是：
- 把“底层对象存储 provider”与“稳定公共下载出口”明确分层
- 把对象访问策略从“只有签名 URL”升级为“公共长期分发 + 受控签名下载 + 内部受控访问”三类
- 让 `dl-dev.infinex.cn` / `dl.infinex.cn` 逐步从“项目 bucket 的别名”升级为共享 delivery plane 的入口

## 分层边界

### 业务后端
各业务项目（如 InfoV、Laicai）负责：
- 用户身份识别
- 业务规则与领域模型
- 本地 UI 与状态管理
- 代表用户或项目调用 shared-runtime-services

### 共享服务 / 控制面依赖
本项目自身承载的是共享运行时平台，而不是单一 storage 子系统。当前已落地或已锁定边界的共享能力包括：
- Object Service
- Release Service
- 项目协议层与资源绑定解析
- 当前优先推进的 delivery policy / shared distribution plane
- 后续待接入的 Feedback / Crash、AI Service Layer、Domain / Certificate、Config Center

`admin-platform` 负责：
- 版本管理界面
- rollout / force update 控制入口
- 对象与审计查询界面
- feedback 管理视图与项目级 feedback 配置入口（经代理调用 SRS，不自持 feedback 真相源）

> 原则：业务项目负责业务规则，共享服务负责可复用控制面和运行时能力；不要在业务仓库重复实现共享服务内部逻辑。
>
> 原则（共享运行时项目协议层）：当共享服务需要按项目与运行环境路由不同底层资源时，调用方只暴露项目身份与环境身份（如 `projectKey`、`runtimeEnv`），服务端内部通过 `ProjectManifest`、`ProjectServiceBindingResolver` 与 `AdapterFactory / Registry` 解析 `projectKey + runtimeEnv + serviceType` 级别的资源绑定；bucket / provider / region / credentials 等底层细节不得泄漏到 API contract、响应或调用方代码中。
>
> 原则（共享 Storage 访问策略）：共享对象服务必须同时区分对象“存在哪个 provider / bucket”与“应该通过什么下载出口访问”。`public-stable` 对象走共享分发层稳定 URL；`private-signed` / `internal-signed` 对象走签名 URL；禁止把同一条公共下载域名既当长期公共链接，又当所有私有对象的临时下载入口。

## 目录结构
```text
shared-runtime-services/
├── apps/
│   ├── api/
│   └── worker/
├── packages/
│   ├── object-service/
│   ├── release-service/
│   ├── auth/
│   ├── project-context/
│   └── shared-kernel/
├── infra/
├── mock/
└── steering/
```

## 模块划分
### api
- 对外提供 REST API
- 鉴权
- 参数校验
- 同步写操作与查询接口

### worker
- 异步任务
- 审计补偿
- 当前已承接 object storage backfill verify loop
- 本轮新增承接 feedback issue outbox loop（GitHub issue create / retry / backoff / process-pending）
- 未来可承接证书续期、对象巡检、失效链接校验等任务
- 后续随着共享能力增多，可继续拆分为 feedback worker、AI worker、config sync worker 等独立容器，但仍由同一 compose 编排统一管理

### object-service
- 生成上传签名
- 生成下载签名
- 对象完成登记
- 对象删除
- objectKey 规则校验
- 对象元数据真相源
- 仅依赖 `ObjectStorageAdapter` 通用接口，不直接依赖具体供应商 SDK

### release-service
- release 创建
- 最新版本查询
- rollout / force update 更新
- distributionTarget / distributionUrl 真相源

### auth
- project service token 校验
- 为运行时注入 `projectKey` 与 `runtimeEnv`
- 项目协议层通过 `projectKey + runtimeEnv + serviceType` 继续解析 `ProjectManifest` 与 `ProjectServiceBinding`
- 请求体中的 `project` / `env` 只做一致性校验，不作为最终资源路由真相源
- 后续扩展 user-scoped action context 校验

### project-context
- `ProjectManifest` / `ProjectServiceBinding` 类型定义
- binding 解析
- provider 配置解耦
- 协议错误语义统一

### delivery-policy
- 解析对象场景（object profile）
- 决定访问等级（access class）
- 为 `public-stable` 对象生成共享公共 URL
- 将公共分发域名从单项目 bucket 绑定解耦为共享分发层
- 当前最小实现已落地为：SRS API 自身承接 `dl-dev.infinex.cn` / `dl.infinex.cn` 的 Host-constrained 公共下载入口，并在校验对象元数据后 302 redirect 到 provider 下载地址

## API 设计

## 对象存储适配层
### 分层约束
- route / service / domain 层只依赖 provider-neutral 的 `ObjectStorageAdapter`
- 供应商 SDK 只能出现在 adapter 实现层
- Phase 1 默认生产 provider 为 `CosObjectStorageAdapter`
- 本地开发可选 `MinioObjectStorageAdapter`
- 未来可扩展到 S3-compatible / OSS / R2 / 其他对象存储供应商，而不改上层 API contract

### `ObjectStorageAdapter` 最小 contract
- `createUploadRequest(input)`：生成上传签名/直传请求
- `createDownloadRequest(input)`：生成下载签名
- `headObject(input)`：校验对象存在性与元数据
- `deleteObject(input)`：删除对象
- `normalizeObjectKey(input)`：按统一命名规范生成或校验 `objectKey`

### Feedback Runtime contract（当前已进入正式范围）
- intake route：至少支持 `submit-manual`、`submit-errors`、`submit-crash`
- admin route：至少支持 `submissions list/detail`、`retry-github-sync`、`process-pending`、`project-config update`
- final-state route：支持 `verify-fix`、`mark-fixed` 与用户可见 submission 状态聚合
- worker contract：统一执行 GitHub issue create / retry / backoff，并将执行结果回写 submission / outbox 真相源
- control-plane contract：admin-platform 只做代理与 viewer，不本地承接 feedback 真相源

### provider capability matrix（Phase 1）
| 能力 | 通用 contract | COS 默认实现 | MinIO 本地实现 | 说明 |
|------|---------------|-------------|----------------|------|
| 上传签名 | 支持 | 支持（真实 SDK） | 支持 | 上层只关心签名结果，不关心供应商字段命名 |
| 下载签名 | 支持 | 支持（真实 SDK） | 支持 | 下载链接 TTL 由 adapter 统一折算 |
| 对象探测 | 支持 | 支持（真实 SDK） | 支持 | 用于 complete / delete 前校验 |
| 对象删除 | 支持 | 支持（真实 SDK） | 支持 | 删除结果回填统一审计语义 |
| 生命周期 / 版本化 | 非 Phase 1 contract | 可选 | 可选 | 供应商特性不得泄漏到通用 API |

### 项目协议层与资源绑定解析
- 调用方默认只暴露 `projectKey` 与 `runtimeEnv`，不直接传 `bucket` / `provider` / `region` / 凭据等底层资源细节
- 共享运行时服务内部通过 `ProjectManifest` 记录项目身份与注册状态，通过 `ProjectServiceBinding` 记录某项目某运行环境某共享能力的 provider 与资源绑定
- Object Service 在运行时根据 `projectKey + runtimeEnv + serviceType=object_storage` 解析 binding，再由 `ObjectStorageAdapterFactory` 创建对应的 `ObjectStorageAdapter`
- 因此 provider-neutral contract 保持不变，但 adapter 的实例化方式从“全局单例 + 全局 env”升级为“项目级 + 环境级 binding 解析 + 工厂创建”
- 认证真相源升级为 `token -> projectKey + runtimeEnv`；请求体中的 `project` / `env` 只做一致性校验
- Phase 1 默认生产 provider 仍为 `CosObjectStorageAdapter`，但它将作为“按项目配置创建的 provider 实现”存在，而不是全局唯一实例

## 访问策略层（当前已定稿，待 Phase 4 实现）

### object profile
共享对象服务按业务语义区分至少以下对象场景：

| object profile | 典型对象 | 默认 access class | 说明 |
|----------------|----------|-------------------|------|
| `release_artifact` | APK / AAB / 桌面安装包 | `public-stable` | 正式安装包，对外稳定分发 |
| `public_asset` | 公共静态资源 | `public-stable` | 长期可引用 |
| `public_media` | 长期公开图片/视频 | `public-stable` | 面向公开访问 |
| `private_media` | 用户私有媒体 | `private-signed` | 受控访问 |
| `private_document` | 合同/发票/敏感文档 | `private-signed` | 更严格 TTL / 权限 |
| `internal_archive` | 备份/导出/运维归档 | `internal-signed` | 内部使用 |

> 当前代码仍主要基于 `domain + scope + fileKind` 工作；上述 `object profile` 已作为正式设计合同锁定，下一阶段优先实现为元数据 / 策略层，不要求在本轮就破坏既有 API。

### access class
- `public-stable`：返回稳定公共 URL，适合长期引用与对外分发
- `private-signed`：返回临时签名 URL，适合受控访问
- `internal-signed`：返回短时内部访问 URL 或内部专用下载方式

### delivery plane 与 provider plane 分层
- delivery plane 负责公共稳定 URL、环境级下载域名、共享分发入口与后续 CDN/gateway
- provider plane 负责对象真实存储位置、签名、HEAD、删除，以及 provider 专属真实下载出口
- 当前稳定公共入口固定为：
  - `dev/staging`：`https://dl-dev.infinex.cn`
  - `prod`：`https://dl.infinex.cn`
- 当前 provider plane 的真实下载出口通过 `ProjectServiceBinding.config.downloadDomain` 表达；中期推荐统一收口为：
  - `dev/staging`：`https://origin-dev.infinex.cn`
  - `prod`：`https://origin.infinex.cn`
- 两者不能复用同一 host：
  - `public-delivery` 命中 `dl-dev` / `dl` 后，会先进入 SRS，再由 SRS 302 redirect 到 provider 下载地址
  - 如果 provider 下载地址本身仍回到 `dl-dev` / `dl`，请求会再次命中 SRS 公共入口，形成 redirect loop
  - 因此 `downloadDomain` 只能表达 provider plane host，不得复用共享稳定入口
- provider plane 再往下才是 bucket/provider 本体；host 与 bucket 不要求对调用方 1:1 暴露

### provider 下载域名 contract
- `downloadDomain` 是 provider plane 字段，不是用户侧稳定公共入口字段
- 当 binding 配置 `downloadDomain` 时，adapter 生成的真实下载 URL 应以该 host 为准；这既适用于 `private-signed` / `internal-signed`，也适用于 `public-delivery` 最终 302 的 provider 目标
- 若该 host 走腾讯云 CDN / 自定义下载域名，COS adapter 生成签名下载 URL 时必须显式使用 `Domain=<custom-domain>`，并关闭 `ForceSignHost`，避免 Host 被强签名后与自定义域名不一致
- `downloadDomain` 允许随着 provider / CDN / 回源策略演进而变化；但 `dl-dev` / `dl` 这类稳定公共入口合同应保持独立

### runtime object storage 配置合同
- `ProjectServiceBinding.config` 的 object storage provider 配置由 `scripts/seed-projects.ts` 写入数据库；seed 配置解析唯一入口是 `scripts/seed-projects-config.ts`。
- 正式 runtime object storage env keys 仅为 `SHARED_COS_BUCKET`、`SHARED_COS_REGION`、`SHARED_COS_SECRET_ID`、`SHARED_COS_SECRET_KEY`、`SHARED_COS_DOWNLOAD_DOMAIN`。
- dev / prd 差异只由 Infisical dev / prod environment 区分；key 名不再携带 `DEV` / `PRD`。
- `SHARED_DEV_*`、`SHARED_PRD_*`、`INFOV_*`、`LAICAI_*` 与 legacy `COS_*` 不再是 object storage binding seed 的正式输入源。
- deploy workflow 不得内联 COS env reader 或 raw SQL seed；部署时必须在 API 容器中调用 canonical seed 入口，让 env -> DB binding 只经过 `scripts/seed-projects.ts` / `scripts/seed-projects-config.ts` 一套逻辑。
- `ObjectStorageAdapterFactory` 按进程内 cache 复用 adapter；任何 binding config 变更后必须重启 API，避免旧 adapter 继续持有旧 bucket / domain / credentials。

### provider 迁移 playbook（正式协议）
- 迁移对象存储 provider 时，项目侧 contract 保持不变：调用方继续只传 `projectKey + runtimeEnv` 与业务语义字段，用户侧继续使用既有稳定 URL 或签名接口。
- 迁移动作优先收敛在项目协议层 binding、provider adapter、delivery resolver 与对象治理流程内部，不把 bucket/provider 变更扩散到业务项目。
- 推荐迁移顺序：
  1. **prepare**：为目标项目 / 环境准备新 provider binding 与能力矩阵校验；确认新 adapter 已具备 upload/download/head/delete 基础能力。
  2. **dual-write**：新写入对象进入双写或等价双落点阶段；如暂不具备自动双写实现，至少保留“旧读 fallback + 存量迁移中”的过渡状态，不做一次性硬切。
  3. **backfill**：对存量对象按 project/env/profile 分批复制，并校验 size / checksum / headObject 一致性。
  4. **read-fallback**：SRS 读路径优先读新 provider，缺对象或校验失败时自动 fallback 到旧 provider；公共稳定 URL 与签名接口不变。
  5. **gradual-cutover**：按项目 / 环境 / object profile / 流量批次灰度提升新 provider 占比，持续监控 302、fallback、错误率与对象完整性。
  6. **finalize**：确认稳定后再停双写、移除旧读 fallback，并在单独审批后清理旧 provider 对象。
- 回滚原则：任何阶段只要发现对象缺失、签名失败、公共稳定 URL 异常或错误率明显上升，都应立即回退到旧 provider 主读；因为用户侧稳定 URL 不变，所以回滚不应要求业务项目改代码或用户改链接。
- 验收真相源：迁移完成的判断不以“配置改了”为准，而以真实对象抽样校验、公共稳定 URL 可用、签名下载可用、候选命中已按物理落点真相源稳定收敛、项目侧无感知为准。

### 当前状态与目标状态
- **当前最小实现**：Release Service 已通过 delivery resolver 生成 `distributionUrl`，`dl-dev` / `dl` 由腾讯 CDN `PathBasedOrigin -> 124.222.37.77 -> Nginx bridge -> SRS public-delivery route` 承接；SRS 校验对象后再 302 到 provider 下载地址
- **当前 provider 现实态**：Laicai 仍是项目自有 dev/prd bucket；旧链路中的 `dl-dev` / `dl` 仍与该项目的历史下载合同有关，尚未完成“共享两桶”物理收口
- **中期目标状态**：provider plane 收敛为“两个共享 bucket + 两个共享 origin 域名”——`shared-dev-bucket` / `shared-prd-bucket` 承载对象本体，`origin-dev.infinex.cn` / `origin.infinex.cn` 承接真实下载出口；不同项目继续通过 `objectKey` 前缀隔离
- **长期目标状态**：在不改变项目 contract 与用户侧稳定 URL 的前提下，把 `dl-dev` / `dl` 背后的最小 redirect-gateway 继续演进为更正式的 shared origin / gateway / delivery adapter

## Object Service
### objectKey 统一规范（当前实现）
```text
{project}/{env}/{domain}/{scope}/{entityId}/{fileKind}/{yyyy}/{mm}/{uuid}-{filename}
```

### 示例
```text
infov/prod/member/user_123/avatar/2026/04/uuid-head.png
infov/prod/backup/device_456/archive/2026/04/backup-1.zip
laicai/prod/release/android/1.0.1+12/apk/app-release.apk
```

> 现阶段继续沿用上述 objectKey 结构；访问策略由元数据层与 delivery policy 决定，而不是强制通过 key 结构编码全部语义。

### `POST /v1/objects/upload-requests`
用途：申请上传签名。

实现约束：
- route 只调用 Object Service domain contract
- Object Service 只调用 `ObjectStorageAdapter#createUploadRequest`
- 不允许在 route / service 中直接拼 COS SDK 参数或返回 COS 专有语义给上层
- **项目归属真相源**：`projectKey` 由 token 解析得出，`body.project` 必须与之完全一致，否则 403 拒绝
- **运行环境真相源**：`runtimeEnv` 由 token 解析得出，`body.env` 必须与之完全一致，否则拒绝请求
- **objectKey 生成**：必须使用 token 的 `projectKey` 与 `runtimeEnv`，不得信任 `body.project` / `body.env`
- **一致性保证**：DB `project_key`、DB `env` 与 `objectKey` 前缀中的项目/环境部分必须语义一致
- **策略边界**：当前 API 不要求调用方直接传 `accessClass`；下一阶段由对象场景策略层统一解析

请求核心字段：
- project
- env
- domain
- scope
- entityId
- fileKind
- fileName
- contentType
- size
- checksum
- purpose

响应核心字段：
- objectKey
- uploadUrl
- requiredHeaders
- expiresAt

### `POST /v1/objects/download-requests`
用途：申请下载签名。

实现约束：
- 先校验 `objectKey` 与 scope
- 再通过 `ObjectStorageAdapter#createDownloadRequest` 获取下载签名
- 响应仅暴露统一字段 `downloadUrl` / `expiresAt`
- 该接口默认服务于 `private-signed` / `internal-signed` 对象
- `public-stable` 对象的长期链接不应通过不断重签该接口来模拟

请求核心字段：
- objectKey

响应核心字段：
- downloadUrl
- expiresAt

### `POST /v1/objects/complete`
用途：对象上传成功后登记元数据。

实现约束：
- complete 前允许通过 `ObjectStorageAdapter#headObject` 做对象存在性与元数据校验
- 元数据真相源写入数据库，不直接以供应商返回结构作为外部 contract
- 下一阶段在此处补充对象策略元数据（如 object profile / access class / delivery policy snapshot）

请求核心字段：
- objectKey
- size
- checksum

### `DELETE /v1/objects`
用途：删除对象。

实现约束：
- 先做 project token 与 scope 校验
- 删除动作通过 `ObjectStorageAdapter#deleteObject` 执行
- 删除后统一写审计日志，不暴露供应商差异

请求核心字段：
- objectKey

## Release Service
### 核心原则
- 正式二进制不上传 GitHub Release
- GitHub Release 只写 release notes 与外部分发链接
- Android / 桌面安装包走 Object Service + 共享分发层
- iOS 正式分发走 TestFlight
- Release Service 是版本与分发链接真相源

### `POST /v1/releases`
用途：创建 release 记录。

**当前 distributionUrl 生成规则：**
- CI 调用时**无需传 distributionUrl**，只需传 `artifactObjectKey`（上传到 Object Service 后获得）。
- 当前实现仍根据 `env` 直接拼接：
  - `dev` -> `https://dl-dev.infinex.cn/{artifactObjectKey}`
  - `staging` -> `https://dl-dev.infinex.cn/{artifactObjectKey}`
  - `prod` -> `https://dl.infinex.cn/{artifactObjectKey}`
- 若 CI 显式传入 `distributionUrl`，则保留调用方传入值，不被自动覆盖。

**目标演进规则：**
- `distributionUrl` 应由 delivery resolver 基于 `runtimeEnv + accessClass + artifact metadata` 生成
- `dl-dev` / `dl` 应指向共享分发层，而不是某个项目 bucket 的长期别名
- provider 迁移时，不要求业务项目、GitHub Release 或用户侧修改链接合同

请求核心字段：
- project
- platform
- env
- appVersion
- buildNumber
- semanticVersion
- distributionTarget
- `artifactObjectKey`（必传，用于自动生成 distributionUrl）
- releaseNotes
- changelog

### `GET /v1/releases/latest`
用途：查询某项目某平台最新版本。

响应核心字段：
- semanticVersion
- forceUpdate
- minSupportedVersion
- distributionTarget
- distributionUrl
- releaseNotes

### `PATCH /v1/releases/{releaseId}`
用途：更新 rollout 状态、强更策略、最低支持版本、分发链接等。

### `GET /v1/releases`
用途：供 admin-platform 查询 release 列表。

## 数据模型

### 当前核心表
#### `objects`
- id
- project_key
- env
- domain
- scope
- entity_id
- file_kind
- object_key
- file_name
- content_type
- size
- checksum
- visibility
- uploader_type
- uploader_id
- status
- created_at
- deleted_at

#### `app_releases`
- id
- project_key
- platform
- env
- app_version
- build_number
- semantic_version
- distribution_target
- distribution_url
- artifact_object_key
- release_notes
- changelog
- force_update
- min_supported_version
- rollout_status
- created_by
- created_at

#### `release_channels`
- id
- project_key
- platform
- env
- channel
- active_release_id

#### `audit_logs`
记录关键写操作：
- 创建 upload request
- 对象 complete
- 删除对象
- 创建 release
- 更新 rollout / force update / distribution link

#### `project_manifests`
- id
- project_key
- display_name
- status
- created_at
- updated_at

#### `project_service_bindings`
- id
- project_key
- runtime_env
- service_type
- provider
- config
- created_at
- updated_at

#### `feedback_submissions`
- 在既有 submission / GitHub sync 字段之外，final-state contract 追加：
  - `fixed_in_version`：SRS / admin 标记该反馈在哪个版本已修复
  - `fixed_at`：标记修复时间
  - `fix_verified`：用户验证结果（true / false / null）
  - `verification_feedback`：用户验证文字反馈
  - `verified_at`：用户完成验证的时间
  - `status_history_json`：状态历史数组真相源，记录 `reported -> fixed -> open/closed` 等生命周期事件
- user-facing list contract 由 route 层返回 Flutter-friendly 字段：`status`、`fixVersion`、`fixedAt`、`fixVerified`、`verificationFeedback`、`verifiedAt`、`statusHistory`
- 状态映射保持稳定口径：至少覆盖 `pending/reported/failed -> open`、`fixed -> fixed`、`skipped -> closed`，并保留验证结果驱动的 reopen/close 语义

### 下一阶段计划补强的元数据
- `objects.object_profile`：对象场景语义
- `objects.access_class`：访问等级（public-stable / private-signed / internal-signed）
- `objects.delivery_policy` 或等价快照字段：公共 URL 生成策略
- provider 迁移进入实现阶段后，不再只依赖 `objects` 逻辑元数据，还需要显式记录物理落点真相源

### provider 迁移机制的最小实现切片（当前下一步）
为让 future provider 切换不再依赖“改 binding + 重启进程”的脆弱做法，当前最小实现切片锁定为三块：

#### 1. 逻辑对象与物理落点分层
- `objects` 继续作为逻辑对象真相源：业务语义、访问策略、审计归属、稳定 objectKey
- 新增 `object_storage_locations`（命名可在实现时微调）作为物理落点真相源，至少记录：
  - `object_id`
  - `binding_id`
  - `provider`
  - `location_role`（`primary` / `replica` / `fallback`）
  - `status`（如 `active` / `pending_backfill` / `backfilled` / `failed`）
  - `checksum_verified_at` / `last_head_at` 等校验字段
- 这样即使项目级 binding 未来切到新 provider，旧对象仍能根据自己的物理落点记录被正确读取或回填

#### 2. 写入时固化 binding 真相源
- `POST /v1/objects/upload-requests` / `complete` 需要把“当前命中的 binding”固化到对象落点记录里，而不是只把 project/env 写入对象表
- 首个实现阶段至少要求：新对象创建时，能明确知道它最初落在哪个 binding/provider 上
- 这一步是后续 dual-write、backfill、read-fallback 的前置条件；没有写入时真相源，就无法在切 binding 后区分“旧对象还在旧 provider”还是“新对象已在新 provider”

#### 3. 迁移任务真相源
- 新增 `storage_migration_jobs`（命名可在实现时微调）用于记录一次 provider 迁移批次，至少覆盖：
  - `project_key`
  - `runtime_env`
  - `service_type`
  - `source_binding_id`
  - `target_binding_id`
  - `selector/filter`
  - `status`
  - `stats / detail`
- worker 后续基于该表逐批执行 backfill / verify / cutover；当前切片先把任务模型建出来，不要求本轮就跑完整迁移

## 共享服务接入表

| 能力 | 当前状态 | 本地入口/适配层 | 目标共享服务 | 备注 |
|------|----------|----------------|-------------|------|
| 对象上传下载 | shared | 本项目 Object Service API | Object Service | Phase 1 MVP |
| 版本与更新 | shared | 本项目 Release Service API | Release / Update Service | Phase 1 MVP |
| 公共分发层 | planned | 当前为 env 直拼 URL | Delivery Plane / Gateway | 下一阶段优先实现 |
| 崩溃与反馈 | in-progress | SRS feedback routes + worker（进行中） | Feedback / Crash Service | 2026-04 起进入当前实施阶段 |
| AI 能力 | local-first | 暂不实现 | AI Service Layer | 后续阶段 |
| 域名证书 | local-first | 暂不实现 | Domain / Certificate Service | 后续阶段 |
| 配置中心 | local-first | 暂不实现 | Config Center | 后续阶段 |

## Mock 层架构

项目使用分层 Mock 架构，Mock 数据作为跨阶段共享资产贯穿原型→开发→演示全流程。

### 目录结构
```
mock/
├── fixtures/
├── factories/
├── repositories/
└── README.md
```

### 核心原则
1. 接口抽象优先
2. 环境驱动切换
3. 原型 / 开发 / 演示共享 fixtures
4. 即使接入真实服务，也保留 mock adapter 用于测试与 demo

## 错误处理
- project token 非法：拒绝请求
- objectKey scope 非法：拒绝签名或拒绝删除
- 上传完成但未登记：后续由 worker / 审计治理
- release 重复登记：通过幂等或显式拒绝处理
- 受控对象误走公共稳定链接：拒绝或返回策略错误
- 共享下载域名仍实际绑定单一项目 bucket：视为分发层未完成，不应误判为“共享 Storage 已全量闭环”

## 参考文档
- `steering/PROJECT_RULES.md` - 项目特定硬规则
- `steering/TECH_STACK.md` - 技术栈
- `steering/IMPLEMENTATION_PLAN.md` - 共享服务接入与迁移节奏
