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
- 默认生产 provider：腾讯云 COS
- 本地开发兼容 provider：MinIO（可选）
- 未来可切换 provider：S3-compatible / OSS / R2 / 其他对象存储供应商
- 数据库访问层：Prisma（已锁定，负责 schema、migration 与类型安全查询）

## 对象存储适配层
- 上层 Object Service 只依赖 provider-neutral 的 `ObjectStorageAdapter` 接口
- Phase 1 默认实现 `CosObjectStorageAdapter`
- `CosObjectStorageAdapter` 作为纯配置驱动的 provider 实现存在：运行时由 `ObjectStorageAdapterFactory` 根据项目级 binding 显式注入 bucket / region / credentials / sign TTL，而不是由全局 `COS_*` 环境变量直接驱动全局单例
- 共享运行时服务通过项目协议层（`ProjectManifest` + `ProjectServiceBinding` + `ProjectContextResolver`）按 `projectKey` 解析目标 provider 配置
- 本地开发环境可选 `MinioObjectStorageAdapter`
- 未来新增供应商时，只在 adapter 实现层增加 provider，不改上层 API contract
- route / service / domain 层不得直接依赖 COS 专有 SDK API，也不得直接 `new` 具体 provider adapter

## 共享服务依赖
本项目本身不是业务项目依赖共享服务的消费者；它就是共享运行时服务本体。

### 已接入的共享服务
- Object Service：本项目自身实现
- Release / Update Service：本项目自身实现
- Feedback / Crash Service：Phase 1 暂不实现
- AI Service Layer：Phase 1 暂不实现
- Domain / Certificate Service：Phase 1 暂不实现
- Config Center：Phase 1 暂不实现

### 暂未接入 / 临时本地实现
- 证书 / 域名任务先不进入 MVP
- AI / Feedback / Crash 先仅在文档层保留边界，不落实现
- admin-platform 当前如继续使用 Supabase，仅允许停留在控制面辅助层，不作为本项目运行时内核依赖

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
### Phase 1
使用 Docker Compose 起步，至少包含：
- `gateway`
- `api`
- `worker`
- `postgres`
- `redis`

### 后续可演进方向
- 更细粒度的容器拆分
- 单独部署 worker
- 加入 metrics / tracing / alerting
- 接入更正式的编排层（如未来确有必要）

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
