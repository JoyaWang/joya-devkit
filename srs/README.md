# shared-runtime-services

`shared-runtime-services` 是面向 InfoV、Laicai 及后续活跃项目的共享运行时服务底座，用来承载跨项目重复能力的统一 API 与真相源。

## 项目定位

它不是业务 App，也不是运营后台；它是所有业务项目共同依赖的 **Runtime Layer**。

分层边界：
- `shared-runtime-services`：共享运行时服务本体
- `admin-platform`：Control Plane / 运营控制台
- 业务项目（InfoV / Laicai / ...）：项目接入层与业务规则层

## Phase 1 当前范围

首期只落两块最值钱、最容易复用的共享能力：

1. **Object Service**
   - 上传签名
   - 下载签名
   - objectKey 规范
   - 对象元数据登记
   - 对象删除与审计

2. **Release Service**
   - 版本登记
   - 分发链接真相源
   - 最新版本查询
   - rollout / force update 控制
   - GitHub Release link-only 发布约束

## 当前状态

- 项目目录已创建
- 标准 Joya 文档合同已建立
- `mock/` 标准目录已建立
- 项目级 agent 自进化运行时支持已接入
- 需求、方案、计划正在以文档为先的方式固化到 `steering/`

## 已锁定的关键决策

- 新建独立项目 `shared-runtime-services`
- 本项目是**共享运行时平台**，不是单一 storage 服务仓库
- 第一阶段采用 **Docker Compose** 部署，并作为后续多个 shared service 的统一编排入口
- 运行时主技术栈采用 **Node.js + TypeScript + Fastify + PostgreSQL + Redis**
- 数据库访问层采用 **Prisma**
- 对象存储采用 provider adapter 架构，COS 仅作为 Phase 1 默认生产 provider
- `admin-platform` 只做控制面，不再承载共享运行时真相源
- 正式发布二进制不上传 GitHub Release；GitHub Release 只保留 release notes 与外部分发链接
- iOS 正式分发默认走 TestFlight；Android / 桌面安装包默认走 COS / Object Service
- 后续每个共享能力可按需要拆为独立容器或独立 runtime module，对外提供服务，但整体仍通过统一 compose 部署
- Supabase 即使后续保留，也只允许停留在控制面辅助层，不进入共享运行时主内核

## 下一步

1. 审阅并确认 `steering/` 下的需求、方案与计划文档
2. 初始化 git 仓库与 `main` / `dev` 基线
3. 开始搭建 `api` / `worker` / `postgres` / `redis` 最小运行骨架
4. 先实现 Object Service，再实现 Release Service

## 参考文档

- `progress.md`
- `steering/SESSION_CONTEXT.md`
- `steering/PRD.md`
- `steering/APP_FLOW.md`
- `steering/TECH_STACK.md`
- `steering/BACKEND_STRUCTURE.md`
- `steering/IMPLEMENTATION_PLAN.md`
