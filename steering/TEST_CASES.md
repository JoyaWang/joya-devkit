# shared-runtime-services 测试用例

> 本文档是所有测试脚本的唯一设计依据。测试脚本必须按本文档编写，不得自行增减验证点。
> 测试范围和策略见 `steering/TEST_PLAN.md`。

---

## 一、测试环境与约束

### 测试账号

| 角色 | 账号 | 密码 | 设备 | 用途 |
|------|------|------|------|------|
| 项目服务 token | 待生成 | - | local / CI | API 调用 |

### 前置操作（每个测试文件必须执行）
1. 启动本地 docker-compose 基础环境
2. 准备测试 project token
3. 清理或隔离测试数据命名空间

### 验证原则（强制）
1. 每个用例必须验证业务结果，不是“接口返回 200 就算成功”
2. scope 校验失败必须明确断言拒绝行为
3. release 链路必须验证 link-only 语义，不允许退回 GitHub 二进制附件逻辑
4. mock 与 real adapter 的切换必须通过配置控制，不允许业务代码硬编码

---

## 二、业务流程覆盖总览

| 阶段 | 优先级 | 数量 | 说明 |
|------|--------|------|------|
| 阶段 1 | P0 | 10 项 | Object / Release / 鉴权 / 项目归属校验 / 基础设施核心闭环 |
| 阶段 2 | P1 | 4 项 | 删除、列表、rollout、审计 |
| 阶段 3 | P2 | 预留 | 扩展能力与边界场景 |

---

## 三、阶段 1：P0 核心路径

### O-01: 申请上传签名
**优先级**: P0 | **阶段**: 1

**前置条件**:
- 提供合法 project token
- 提供合法 project / env / domain / scope / entityId / fileKind
- body.project 必须与 token 解析出的 projectKey 一致
- body.env 必须与 token 解析出的 runtimeEnv 一致

**断言（必须全部通过）**:
- 返回 `objectKey`
- 返回 `uploadUrl`
- 返回 `expiresAt`
- `objectKey` 前缀必须使用 token 的 projectKey 与 runtimeEnv（真相源），而非 body.project / body.env
- `objectKey` 符合约定路径规则
- DB `project_key` / `env` 与 `objectKey` 前缀中的项目/环境部分语义一致

### O-01b: 项目归属不一致被拒绝
**优先级**: P0 | **阶段**: 1

**前置条件**:
- 提供合法 project token（如 laicai token）
- body.project 与 token 的 projectKey 不一致（如 body.project=infov）

**断言（必须全部通过）**:
- 返回 403 状态码
- 错误码为 `project_mismatch`
- 错误信息明确指出 body.project 与认证项目不匹配
- 不生成 objectKey / uploadUrl

### O-01c: 环境归属不一致被拒绝
**优先级**: P0 | **阶段**: 1

**前置条件**:
- 提供合法 project token，且 token 解析出的 `runtimeEnv=dev`
- body.env 与 token 的 `runtimeEnv` 不一致（如 body.env=prd）

**断言（必须全部通过）**:
- 返回拒绝状态码
- 错误信息明确指出 body.env 与认证环境不匹配
- 不生成 objectKey / uploadUrl

### O-01d: 同项目不同环境命中不同 bucket
**优先级**: P0 | **阶段**: 1

**前置条件**:
- 准备同一项目的 dev / prd 两种 token
- 已注册对应 `ProjectServiceBinding(projectKey, runtimeEnv, object_storage)`

**断言（必须全部通过）**:
- dev token 请求命中 dev bucket
- prd token 请求命中 prd bucket
- 两次返回的 `objectKey` 环境段不同且与 token 解析结果一致

### O-02: 非法 scope 被拒绝
**优先级**: P0 | **阶段**: 1

**断言（必须全部通过）**:
- 非法 scope 请求被拒绝
- 返回明确错误信息
- 不生成 uploadUrl

### O-03: 上传完成登记
**优先级**: P0 | **阶段**: 1

**断言（必须全部通过）**:
- `complete` 成功写入对象元数据
- 对象状态变为 `active`
- 审计日志记录本次完成事件

### O-04: 申请下载签名
**优先级**: P0 | **阶段**: 1

**断言（必须全部通过）**:
- 返回 `downloadUrl`
- 返回 `expiresAt`
- 非法 objectKey 不返回下载签名

### R-01: 创建 release
**优先级**: P0 | **阶段**: 1

**断言（必须全部通过）**:
- release 记录写入成功
- `distributionTarget` / `distributionUrl` / `semanticVersion` 正确保存
- 可记录 Android COS 分发或 iOS TestFlight 分发

### R-02: 查询最新版本
**优先级**: P0 | **阶段**: 1

**断言（必须全部通过）**:
- 返回最新 semanticVersion
- 返回 distributionTarget / distributionUrl
- 返回 releaseNotes
- 返回 forceUpdate / minSupportedVersion（即使默认值为空也要结构正确）

### A-01: project token 校验
**优先级**: P0 | **阶段**: 1

**断言（必须全部通过）**:
- 合法 token 可访问接口
- token 可同时解析 `projectKey` 与 `runtimeEnv`
- 非法 token 被拒绝
- 缺失 token 被拒绝

### I-01: healthcheck 与 compose 基础可用
**优先级**: P0 | **阶段**: 1

**断言（必须全部通过）**:
- `docker compose up` 后基础服务可运行
- `/health` 可返回成功
- API 能连通数据库

---

## 四、阶段 2：P1 支撑流程

### O-05: 删除合法对象
**优先级**: P1 | **阶段**: 2

### O-06: provider adapter contract 一致性
**优先级**: P1 | **阶段**: 2

**断言（必须全部通过）**:
- 上层 Object Service 测试替身可通过统一 adapter contract 接入
- provider 切换不要求改动 route / service contract
- COS 专有参数不会泄漏到通用 API 层

### R-03: 更新 rollout / force update
**优先级**: P1 | **阶段**: 2

### R-04: 查询 release 列表
**优先级**: P1 | **阶段**: 2

### L-01: 审计日志查询
**优先级**: P1 | **阶段**: 2

---

## 五、阶段 3：P2 边缘场景
- 重复 release 幂等
- 上传成功但 complete 丢失的治理策略
- distributionUrl 缺失场景
- 未来扩展模块的 contract 边界验证
