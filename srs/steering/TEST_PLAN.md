# shared-runtime-services 测试计划

> 本文档定义项目的测试范围、策略、环境和分阶段计划。
> 具体测试用例见 `steering/TEST_CASES.md`。

---

## 1. 测试范围

### 在范围内

| 模块 | 说明 |
|------|------|
| Object Service | 上传签名、下载签名、完成登记、删除、scope 校验、provider adapter contract、多环境 binding 路由、物理落点真相源写入、候选读位置解析 |
| Release Service | release 创建、最新版本查询、rollout / force update 更新、distributionUrl 策略化生成 |
| 鉴权 | project service token 校验、`runtimeEnv` 解析与一致性约束 |
| Feedback Service | client settings、manual submit、admin list/detail/retry/process-pending、GitHub issue outbox worker |
| 基础设施 | api / worker / postgres / redis / docker-compose 基础可用性 |

### 不在范围内
- AI Service Layer（Phase 1 不实现）
- Domain / Certificate Service（Phase 1 不实现）
- 独立控制台 UI（由 `admin-platform` 承担）

## 2. 测试策略

### 测试层级选择

| 测试层级 | 是否启用 | 工具 | 说明 |
|----------|---------|------|------|
| 单元测试 | ✅ | Vitest | 模块级 contract 与规则校验；命令：`pnpm test`（即 `vitest run`） |
| 集成测试 | ✅ | Vitest | API + DB + adapter |
| E2E 测试 | ✅ | `scripts/e2e-verify.sh` | 以 HTTP API 为主，59 断言 |
| 回归测试 | ✅ | Vitest | Object / Release 核心流程 |
| 冒烟测试 | ✅ | curl / script | healthcheck 与基本路由 |
| 兼容性测试 | ❌ | - | Phase 1 暂不优先 |
| 性能测试 | ❌ | - | Phase 1 暂不优先 |
| 手动测试 | ✅ | curl / Postman / 控制面联调 | 联调与验收 |

### 自动化目标
- P0 核心路径自动化率：80%+
- 回归测试自动化率：70%+

### 常用测试命令

```bash
# 全部测试
pnpm test

# 监听模式（开发时）
pnpm test:watch

# 类型检查（全部子包）
pnpm typecheck

# E2E 验证脚本
bash scripts/e2e-verify.sh

# 单个测试文件
pnpm exec vitest run tests/seed-projects-config.test.mts
```

## 3. 测试环境

### 测试账号

| 角色 | 账号 | 密码 | 设备 | 用途 |
|------|------|------|------|------|
| 项目服务 token | 待生成 | - | CI / local | 服务间调用 |

### 设备要求

| 设备 | 系统版本 | 用途 |
|------|---------|------|
| macOS 开发机 | 当前本机环境 | 本地 docker-compose + API 联调 |

### 环境配置

```bash
# Docker Compose 启动（本地 PostgreSQL）
docker compose up -d

# 运行测试
pnpm test

# 类型检查
pnpm typecheck

# E2E 验证
bash scripts/e2e-verify.sh
```

## 4. 业务流程清单

### Object Service

| # | 流程 | 优先级 | 阶段 |
|---|------|--------|------|
| O-01 | 申请上传签名 | P0 | 1 |
| O-01b | body.project 不一致拒绝 | P0 | 1 |
| O-01c | body.env / runtimeEnv 不一致拒绝 | P0 | 1 |
| O-01d | 同项目不同环境命中不同 bucket | P0 | 1 |
| O-02 | 上传完成登记 | P0 | 1 |
| O-02b | 对象策略元数据默认写入 | P0 | 1 |
| O-02c | complete 后写入 primary storage location | P0 | 1 |
| O-02d | dual-write 任务存在时 complete 补写 `pending_backfill` replica location | P0 | 1 |
| O-02e | backfill runner 校验 `pending_backfill` replica location 并在 worker 启动后自动调度推进 | P0 | 1 |
| O-03 | 申请下载签名 | P0 | 1 |
| O-03b | 下载按 `primary -> replica/fallback -> resolver` 顺序命中候选位置 | P0 | 1 |
| O-03c | 公共分发入口按 `primary -> replica/fallback -> resolver` 顺序命中候选位置 | P0 | 1 |
| O-04 | 删除合法对象 | P1 | 2 |
| O-05 | 拒绝非法 scope | P0 | 1 |

### Release Service

| # | 流程 | 优先级 | 阶段 |
|---|------|--------|------|
| R-01 | 创建 release | P0 | 1 |
| R-01b | `artifactObjectKey` 通过 delivery resolver 自动生成稳定公共 URL | P0 | 1 |
| R-01c | 非 `public-stable` 对象拒绝生成公共分发 URL | P0 | 1 |
| R-02 | 查询最新版本 | P0 | 1 |
| R-03 | 更新 rollout / force update | P1 | 2 |
| R-04 | 查询 release 列表 | P1 | 2 |

### 基础设施

| # | 流程 | 优先级 | 阶段 |
|---|------|--------|------|
| I-01 | healthcheck 可用 | P0 | 1 |
| I-02 | project token 校验 | P0 | 1 |
| I-02b | token 解析 runtimeEnv | P0 | 1 |
| I-03 | docker-compose 启动成功 | P0 | 1 |

## 5. 分阶段实施

### 阶段 1: P0 核心路径
**目标**：验证 Object / Release / 鉴权 / 基础设施的最小闭环。

### 阶段 2: P1 支撑流程
**目标**：补齐删除、rollout 更新、release 列表查询和审计路径。

### 阶段 3: 扩展能力
**目标**：为后续 Feedback / AI / Cert / Config 做接口与回归准备。

## 6. 测试执行规范
- 所有关键 contract 变更必须先补测试再改实现
- objectKey 规则与 link-only release 规则必须有自动化验证
- 任何正式完成声明前，都必须展示最新测试或命令验证证据
