# 后端结构

## 架构概述
`shared-runtime-services` 是多个业务项目共用的 Runtime Layer，用于承载对象存储、版本发布与分发链接等跨项目重复能力。首期采用模块化单体（modular monolith）方式实现，以降低部署和演进复杂度。

## 分层边界

### 业务后端
各业务项目（如 InfoV、Laicai）负责：
- 用户身份识别
- 业务规则与领域模型
- 本地 UI 与状态管理
- 代表用户或项目调用 shared-runtime-services

### 共享服务 / 控制面依赖
本项目自身承载：
- Object Service
- Release Service

`admin-platform` 负责：
- 版本管理界面
- rollout / force update 控制入口
- 对象与审计查询界面

> 原则：业务项目负责业务规则，共享服务负责可复用控制面和运行时能力；不要在业务仓库重复实现共享服务内部逻辑。

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
- 未来可承接证书续期、对象巡检、失效链接校验等任务

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

### provider capability matrix（Phase 1）
| 能力 | 通用 contract | COS 默认实现 | MinIO 本地实现 | 说明 |
|------|---------------|-------------|----------------|------|
| 上传签名 | 支持 | 支持（真实 SDK + fallback） | 支持 | 上层只关心签名结果，不关心供应商字段命名 |
| 下载签名 | 支持 | 支持（真实 SDK + fallback） | 支持 | 下载链接 TTL 由 adapter 统一折算 |
| 对象探测 | 支持 | 支持（真实 SDK + fallback） | 支持 | 用于 complete / delete 前校验 |
| 对象删除 | 支持 | 支持（真实 SDK + fallback） | 支持 | 删除结果回填统一审计语义 |
| 生命周期 / 版本化 | 非 Phase 1 contract | 可选 | 可选 | 供应商特性不得泄漏到通用 API |

### 项目协议层与资源绑定解析
- 调用方默认只暴露 `projectKey` 与 `runtimeEnv`，不直接传 `bucket` / `provider` / `region` / 凭据等底层资源细节
- 共享运行时服务内部通过 `ProjectManifest` 记录项目身份与注册状态，通过 `ProjectServiceBinding` 记录某项目某运行环境某共享能力的 provider 与资源绑定
- Object Service 在运行时根据 `projectKey + runtimeEnv + serviceType=object_storage` 解析 binding，再由 `ObjectStorageAdapterFactory` 创建对应的 `ObjectStorageAdapter`
- 因此 provider-neutral contract 保持不变，但 adapter 的实例化方式从“全局单例 + 全局 env”升级为“项目级 + 环境级 binding 解析 + 工厂创建”
- 认证真相源升级为 `token -> projectKey + runtimeEnv`；请求体中的 `project` / `env` 只做一致性校验
- Phase 1 默认生产 provider 仍为 `CosObjectStorageAdapter`，但它将作为“按项目配置创建的 provider 实现”存在，而不是全局唯一实例

## Object Service
### objectKey 统一规范
```text
{project}/{env}/{domain}/{scope}/{entityId}/{fileKind}/{yyyy}/{mm}/{uuid}-{filename}
```

### 示例
```text
infov/prod/member/user_123/avatar/2026/04/uuid-head.png
infov/prod/backup/device_456/archive/2026/04/backup-1.zip
laicai/prod/release/android/1.0.1+12/apk/app-release.apk
```

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
- Android / 桌面安装包走 COS / Object Service
- iOS 正式分发走 TestFlight
- Release Service 是版本与分发链接真相源

### `POST /v1/releases`
用途：创建 release 记录。

**distributionUrl 生成规则**：
- CI 调用时**无需传 distributionUrl**，只需传 `artifactObjectKey`（上传到 Object Service 后获得）。
- SRS 根据 `env` 自动拼接生成 distributionUrl：
  - `dev` -> `https://dl-dev.infinex.cn/{artifactObjectKey}`
  - `staging` -> `https://dl-dev.infinex.cn/{artifactObjectKey}`
  - `prod` -> `https://dl.infinex.cn/{artifactObjectKey}`
- 若 CI 显式传入 `distributionUrl`，则保留调用方传入值，不被自动覆盖。

请求核心字段：
- project
- platform
- env
- appVersion
- buildNumber
- semanticVersion
- distributionTarget
- **artifactObjectKey**（必传，用于自动生成 distributionUrl）
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

### `objects`
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

### `app_releases`
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

### `release_channels`
- id
- project_key
- platform
- env
- channel
- active_release_id

### `audit_logs`
记录关键写操作：
- 创建 upload request
- 对象 complete
- 删除对象
- 创建 release
- 更新 rollout / force update / distribution link

### `project_manifests`
- id
- project_key
- display_name
- status
- created_at
- updated_at

### `project_service_bindings`
- id
- project_key
- runtime_env
- service_type
- provider
- config
- created_at
- updated_at

## 共享服务接入表

| 能力 | 当前状态 | 本地入口/适配层 | 目标共享服务 | 备注 |
|------|----------|----------------|-------------|------|
| 对象上传下载 | shared | 本项目 Object Service API | Object Service | Phase 1 MVP |
| 版本与更新 | shared | 本项目 Release Service API | Release / Update Service | Phase 1 MVP |
| 崩溃与反馈 | local-first | 暂不实现 | Feedback / Crash Service | 后续阶段 |
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
- distributionUrl 缺失：允许创建记录，但 GitHub Release 只能写“未填写链接”，不能退回 GitHub 二进制附件

## 参考文档
- `steering/PROJECT_RULES.md` - 项目特定硬规则
- `steering/TECH_STACK.md` - 技术栈
- `steering/IMPLEMENTATION_PLAN.md` - 共享服务接入与迁移节奏
