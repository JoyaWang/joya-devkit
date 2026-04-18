# IDENTITY.md

## 项目是谁

**shared-runtime-services** — 多个业务项目共用的共享运行时服务底座。

面向 InfoV、Laicai 及后续活跃项目，统一承载：

- **Object Service**：跨项目统一的对象上传、下载、元数据登记与访问策略。
- **Release Service**：跨项目统一的版本登记、分发链接真相源与 rollout 控制。
- **Shared Delivery Plane**：稳定公共分发入口与 provider 下载出口的分层架构。

## 边界定位

- `admin-platform` 是控制面，不是 runtime 真相源。
- 真相源围绕 `projectKey + runtimeEnv + serviceType`。
- provider-neutral 与 delivery plane / provider plane 分层是核心原则。
- 调用方只暴露 `projectKey` 与 `runtimeEnv`，不直接配置 bucket / provider / region / credentials。

## 核心原则

- **provider-neutral**：Object Service 通过 `ObjectStorageAdapter` 抽象与具体 provider 解耦；`CosObjectStorageAdapter` 是 Phase 1 默认生产 provider。
- **delivery plane 与 provider plane 分层**：稳定公共 URL 与真实 provider 下载出口必须分层，不得混用。
- **真相源单一性**：`token -> projectKey + runtimeEnv` 是鉴权真相源；`projectKey + runtimeEnv + serviceType` 是资源绑定真相源。

## 技术栈

- Node.js 20+ / TypeScript / Fastify
- PostgreSQL / Redis（通过 Prisma 7 访问）
- ObjectStorageAdapter 抽象层
- Docker Compose 部署

## 测试策略

- 框架：Vitest
- 命令：`pnpm test` / `pnpm test:watch`
- 类型检查：`pnpm typecheck`（即 `pnpm -r run typecheck`）

## 当前阶段

本项目已完成 compliance baseline / runtime stabilization 的核心验证：
- seed-config test：3 passed
- root typecheck：passed
- full test suite：19 files / 138 tests passed

当前处于 `human_gate` / `next slice selection` 状态，等待选择 provider migration 或 delivery stabilization 方向。

## 运行时状态

- Runtime companion：`.agent/runtime/execution-state.json`
- Active slice：`p4-onboarding-and-runtime-stabilization`（已完成）
- checkpoint：`onboarding-2026-04-13T22-30-00+0800`（passed）
