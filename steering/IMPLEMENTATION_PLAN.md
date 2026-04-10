# 实施计划

## 阶段概述
本项目采用“文档先行 + 模块化单体 + Docker Compose 起步”的方式推进。首期目标不是一次性做全共享平台，而是先把最有复用价值的两块能力做成可运行 MVP：Object Service 与 Release Service。

## 共享服务接入策略
本项目本身就是共享运行时服务，因此不再把 Object / Release 视为外部依赖，而是首期直接实现。

| 能力 | 当前策略 | 目标状态 | 迁移时机 |
|------|----------|----------|---------|
| Object Service | direct | shared runtime core | Phase 1 |
| Release / Update Service | direct | shared runtime core | Phase 1 |
| Feedback / Crash Service | local-first | shared runtime module | 后续阶段 |
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
- [x] 完成生产部署硬化（clean Docker build、Prisma generate、Nginx 反代、GitHub `prd` environment）

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
- [x] Android 可返回 COS 下载链接
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
- [x] 为 `infov` / `laicai` 准备 dev / prd 首批项目 binding 数据
- [x] 补齐单元测试、路由测试和 E2E 验证

### 验收标准
- [x] 不同 `projectKey` / `runtimeEnv` 请求可路由到不同对象存储资源
- [x] 请求体中的 `project` / `env` 只做一致性校验，最终路由真相源来自认证结果
- [x] 未注册项目、未绑定对象存储能力或环境不匹配时返回明确协议错误
- [x] Object Service route 文件不再直接 `new CosObjectStorageAdapter()`
- [x] 全部 build / typecheck / test / E2E 通过

## Phase 4: 首批项目接入
### 目标
让共享服务真正跑在现有项目上，而不只是文档和空 API。

### 任务清单
- [ ] 为 InfoV 注册 `ProjectManifest` 与 dev / prd 首批共享能力 binding
- [ ] InfoV Object Service dev / prd 协议接入验证
- [ ] InfoV 发布链路接入 Release Service
- [ ] 为 Laicai 注册 `ProjectManifest` 与 dev / prd 首批共享能力 binding
- [ ] Laicai Object Service dev / prd 协议接入验证
- [ ] Laicai 发布链路接入 Release Service
- [ ] 对比迁移前后的重复逻辑与维护成本
- [ ] 更新接入项目的 `TECH_STACK.md` / `BACKEND_STRUCTURE.md` / `IMPLEMENTATION_PLAN.md`

### 验收标准
- [ ] 至少两个项目共享同一 Object / Release 契约
- [ ] 重复签名逻辑和分发真相源不再散落在项目内
- [ ] 接入状态在文档中可见

## Phase 5: 控制面接入与扩展
### 目标
让 admin-platform 成为可视化控制面，并为后续 Feedback / AI / Cert / Config 扩展预留位置。

### 任务清单
- [ ] release 列表与详情查询页
- [ ] rollout / force update 管理页
- [ ] distribution link 管理页
- [ ] 对象元数据与审计页
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
