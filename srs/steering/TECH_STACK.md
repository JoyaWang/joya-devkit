# 技术栈

## 核心技术
- **Node.js 20+**
- **TypeScript**
- **Fastify**
- **PostgreSQL**
- **Redis**
- **Docker Compose**

## 前端
本项目 Phase 1 不包含独立前端应用。

UI / Control Plane 暂由 `admin-platform` 承载；`shared-runtime-services` 当前只负责运行时 API 与 worker。

## 后端
- 运行时框架：Fastify
- 语言：TypeScript
- 主数据库：PostgreSQL
- 缓存 / 队列 / 幂等：Redis（推荐启用）
- 对象存储抽象：`ObjectStorageAdapter`
- 公共分发抽象：`DeliveryPolicyResolver` / `StorageDeliveryAdapter`（当前已锁定为下一阶段正式实现方向）
- 默认生产对象存储 provider：腾讯云 COS
- 本地开发兼容 provider：MinIO（可选）
- 未来可切换 provider：S3-compatible / OSS / R2 / 其他对象存储供应商
- 数据库访问层：Prisma（已锁定，负责 schema、migration 与类型安全查询）

## 对象存储与分发适配层
- 上层 Object Service 只依赖 provider-neutral 的 `ObjectStorageAdapter` 接口
- Phase 1 默认实现 `CosObjectStorageAdapter`
- `CosObjectStorageAdapter` 作为纯配置驱动的 provider 实现存在：运行时由 `ObjectStorageAdapterFactory` 根据项目级 binding 显式注入 bucket / region / credentials / sign TTL，而不是由全局 `COS_*` 环境变量直接驱动全局单例
- 共享运行时服务通过项目协议层（`ProjectManifest` + `ProjectServiceBinding` + `ProjectContextResolver`）按 `projectKey + runtimeEnv + serviceType` 解析目标 provider 配置
- 本地开发环境可选 `MinioObjectStorageAdapter`
- 未来新增供应商时，只在 adapter 实现层增加 provider，不改上层 API contract
- route / service / domain 层不得直接依赖 COS 专有 SDK API，也不得直接 `new` 具体 provider adapter
- 稳定公共下载地址不直接依赖 provider host；公共分发层应通过 delivery policy / adapter 将 `public-stable` 对象映射到共享分发入口

## 共享服务依赖
本项目本身不是业务项目依赖共享服务的消费者；它就是共享运行时服务本体。

### 接入协议
- 调用方只暴露 `projectKey` 与 `runtimeEnv`（或等价项目/环境身份），不直接配置 bucket / provider / region / credentials
- 对象场景应以业务语义表达（如 object profile / domain / scope / entity identity），由服务端解析访问策略与底层绑定
- 鉴权层的正式真相源升级为 `token -> projectKey + runtimeEnv`
- 请求体中的 `project` / `env` 仅作一致性校验
- `ProjectServiceBinding` 的正式绑定键为 `projectKey + runtimeEnv + serviceType`
- Release 查询中的 `env` 仍是发布环境语义，不等于 Object Service 的资源绑定 `runtimeEnv`，两者不得混用
- 公共长期分发入口默认按环境抽象：当前 `dev/staging` 统一使用 `https://dl-dev.infinex.cn`，`prod` 使用 `https://dl.infinex.cn`；这些域名应属于共享分发层，而不是项目级 bucket 映射
- 真实 provider 下载出口应与 `dl-dev` / `dl` 分离：当 binding.config 配置 `downloadDomain` 时，该域名只作为 provider plane 的真实下载出口，不得与共享稳定入口复用
- 若 `downloadDomain` 走腾讯云 CDN / 自定义下载域名，COS SDK 生成签名下载 URL 时应传 `Domain=<custom-domain>` 且 `ForceSignHost=false`，避免 Host 被强签名后与 CDN 自定义域名不一致
- 中期推荐收敛为”两个共享 bucket + 两个共享 origin 域名”模型：`shared-dev-bucket` / `shared-prod-bucket` 承载对象本体，`origin-dev.infinex.cn` / `origin.infinex.cn` 承载共享真实下载出口；项目之间继续通过 objectKey 前缀隔离
- 如后续需要更多公共分发入口，应继续在 `*.infinex.cn` 下扩展，而不是让项目重新感知 bucket/provider 细节

### 已接入的共享服务
- Object Service：本项目自身实现
- Release / Update Service：本项目自身实现
- Feedback / Crash Service：已进入当前实现范围，最小闭环已落地到 submission/admin API/outbox worker
- AI Service Layer：Phase 1 暂不实现
- Domain / Certificate Service：Phase 1 暂不实现
- Config Center：Phase 1 暂不实现

### 暂未接入 / 临时本地实现
- 证书 / 域名任务先不进入 MVP
- AI 先仅在文档层保留边界，不落实现
- admin-platform 当前如继续使用 Supabase，仅允许停留在控制面辅助层，不作为本项目运行时内核依赖；release/feedback runtime 真相源都应逐步收口到 SRS
- `distributionUrl` 已升级为 delivery resolver 生成的稳定入口 URL；当前 shared origin 的最小实现为 Host-constrained 的 SRS public delivery route（`dl-dev` / `dl` -> SRS -> 302 redirect provider 下载地址），后续再按需要演进独立 gateway / CDN

## Provider 迁移策略
- 元数据与物理对象位置分离：公共长期 URL 不把 provider host 当合同
- 迁移时优先采用双写、回填、读 fallback 或灰度切流
- 用户侧稳定 URL 尽量保持不变；变化应收敛在 provider binding 与 delivery policy 层
- 任何新 provider 接入都必须通过 adapter / capability matrix 接入，不得把供应商差异散落到 route 或业务项目
- 当前推荐的正式迁移顺序为：`prepare new binding -> dual-write -> backfill -> read fallback -> gradual cutover -> finalize/cleanup`
- 在正式支持自动双写之前，禁止把“直接切 binding”当成迁移方案；至少要保留旧读 fallback 或分批回填保护
- 当前 shared delivery 的生产稳定入口仍为腾讯 CDN `PathBasedOrigin -> 124.222.37.77 -> Nginx bridge -> SRS`；后续即使 provider 变更，该入口合同也尽量保持不变
- 下一实现切片的技术重点不是立即接入第二个 provider，而是先补齐迁移真相源：`object_storage_locations`（物理落点）、`storage_migration_jobs`（迁移批次）、以及读路径 fallback 所需的候选位置解析逻辑

## 开发工具
- Docker / Docker Compose
- Node.js
- pnpm 10（已锁定，详见根 `package.json` `packageManager` 字段）
- TypeScript
- ESLint / Prettier（待实现阶段落地）
- 项目级 `.claude/settings.json` 与 `.opencode/plugins/joya-self-evolution.js`

## 第三方依赖
### 基础设施
- 腾讯云 COS SDK
- PostgreSQL 驱动
- Redis 客户端

### 运行时原则
- 不以 Supabase Edge Functions 作为主运行时承载
- 不以 GitHub Release assets 作为正式二进制分发出口
- 不在运行时内核引入与业务项目强绑定的私有业务依赖

## 部署方式
### 平台级部署原则
`shared-runtime-services` 是共享运行时平台，不是单一 storage 服务仓库。后续每个共享能力（如 object / release / feedback / ai / config / domain-cert）都应优先以独立 runtime module，必要时以独立 container 形式对外提供服务；项目整体统一通过一个 Docker Compose 编排部署。

### Phase 1
当前使用 Docker Compose 起步，运行时容器至少包含：
- `api`
- `worker`
- `postgres`
- `redis`

后续扩展共享能力时，允许按模块继续拆分容器，例如：
- `object-api`
- `release-api`
- `feedback-worker`
- `ai-worker`
- `config-api`

但约束保持不变：
- 仍由同一个 `docker-compose.yml`（或同一组 compose 文件）统一编排
- 共享能力之间通过平台内网络协作，对外统一经过入口层暴露
- 业务项目只感知共享服务 contract，不感知底层容器拆分细节

宿主机入口复用现有 Nginx 反向代理：
- `srs.infinex.cn` -> `127.0.0.1:3010`
- PostgreSQL / Redis 只在 compose 内部网络暴露，不直接开放公网端口
- API 容器对宿主机暴露 `3010`

### CNB + TCR 部署链路（2026-04-26）
- 主部署执行平台迁移为腾讯云 CNB 云原生构建，配置入口为仓库根 `.cnb.yml` 与 `.cnb/web_trigger.yml`。
- GitHub Actions deploy workflows 暂保留为 fallback；CNB dev 验证稳定前不删除 GitHub Actions。
- 镜像仓库仍使用腾讯云 TCR：`ccr.ccs.tencentyun.com/joyawang`。
- SRS 镜像标签合同保持完整 commit SHA：`srs-api:<env>-<CNB_COMMIT>`、`srs-worker:<env>-<CNB_COMMIT>`，并同步维护 `<env>-latest`。
- `api` / `worker` 继续由 `srs/infra/docker-compose.yml` 编排，远端部署仍调用 `srs/scripts/deploy-remote-ssh.sh --skip-code-pull --skip-build --image-tag <tag>`。
- 密钥真相源仍为 Infisical Vault：CNB 只持有 bootstrap token；TCR 凭据从 infra `/providers` 拉取，runtime `env.runtime` 由 `scripts/gen-env-runtime.sh` 生成。
- CNB workflow 必须保持 build / inspect / push 分段日志，便于判断瓶颈在构建还是推送。

### 公共分发域名策略
- 当前默认共享公共分发域名：
  - non-prod：`https://dl-dev.infinex.cn`
  - prod：`https://dl.infinex.cn`
- 这两个域名的长期目标是指向共享分发 origin / gateway，而不是某个项目 bucket
- 如未来需要按缓存策略、安全域、媒体类型拆分，可继续申请更多 `*.infinex.cn` 域名，但项目接入 contract 仍保持 provider-neutral

### 后续可演进方向
- 更细粒度的容器拆分
- 单独部署 worker
- 加入 metrics / tracing / alerting
- 接入更正式的编排层（如未来确有必要）
- 引入正式 Delivery Adapter / shared origin/gateway

## 推荐目录结构
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
│   ├── docker-compose.yml
│   └── migrations/
├── mock/
├── steering/
├── scripts/
└── ref-docs/
```

## 参考文档
- `steering/PROJECT_RULES.md` - 项目特定硬规则
- `steering/PRD.md` - 产品需求
- `steering/BACKEND_STRUCTURE.md` - 共享服务边界与后端分层
