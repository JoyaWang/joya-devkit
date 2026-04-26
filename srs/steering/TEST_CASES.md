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
| 阶段 1 | P0 | 14 项 | Object / Release / Feedback / 鉴权 / 项目归属校验 / 基础设施核心闭环 |
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
- body.env 与 token的 `runtimeEnv` 不一致（如 body.env=prod）

**断言（必须全部通过）**:
- 返回拒绝状态码
- 错误信息明确指出 body.env 与认证环境不匹配
- 不生成 objectKey / uploadUrl

### O-01d: 同项目不同环境命中不同 bucket
**优先级**: P0 | **阶段**: 1

**前置条件**:
- 准备同一项目的 dev / prod 两种 token
- 已注册对应 `ProjectServiceBinding(projectKey, runtimeEnv, object_storage)`

**断言（必须全部通过）**:
- dev token 请求命中 dev bucket
- prod token 请求命中 prod bucket
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

### O-03b: 对象策略元数据默认写入
**优先级**: P0 | **阶段**: 1

**前置条件**:
- 使用合法 token 调用上传签名与 complete 闭环
- 调用方未显式传入 `object_profile` / `access_class`

**断言（必须全部通过）**:
- `objects` 表存在默认策略元数据
- 普通用户附件类对象不会被错误标记为 `public-stable`
- release artifact 类对象可被识别为稳定公共分发候选
- 后续 Release Service 不需要再仅靠 `env` 猜测公共 URL 策略

### O-03c: complete 后写入 primary storage location
**优先级**: P0 | **阶段**: 1

**前置条件**:
- 使用合法 token 完成 upload -> complete 闭环
- 该请求能解析出当前 `ProjectServiceBinding`

**断言（必须全部通过）**:
- `object_storage_locations` 表新增一条 `locationRole=primary` 且 `status=active` 的记录
- 该记录保存 `objectId`、`bindingId`、`provider`
- 该记录对应的是完成登记时命中的 binding，而不是之后动态推导出的当前 binding

### O-03d: dual-write 任务存在时 complete 补写 `pending_backfill` replica location
**优先级**: P0 | **阶段**: 1

**前置条件**:
- 使用合法 token 完成 upload -> complete 闭环
- 当前 `projectKey + runtimeEnv + object_storage` 存在 active `dual_write` migration job
- migration job 的 `targetBindingId` 与当前 primary binding 不同

**断言（必须全部通过）**:
- `complete` 仍照常写入一条 `locationRole=primary` 且 `status=active` 的记录
- 同一次 complete 还会额外写入一条 `locationRole=replica` 且 `status=pending_backfill` 的记录
- 这条 secondary location 指向 migration job 的 `targetBindingId`
- 该行为只声明目标落点，不代表真实文件已经完成跨 provider 双写

### O-03e: backfill runner 校验 `pending_backfill` replica location 并按目标对象状态推进
**优先级**: P0 | **阶段**: 1

**前置条件**:
- 已存在 `locationRole=replica` 且 `status=pending_backfill` 的 `object_storage_locations` 记录
- runner 可根据该 location 的 `bindingId` 找到 target binding
- 场景 A：target binding 上对象已存在
- 场景 B：target binding 上对象不存在
- 场景 C：object 或 binding 查找缺失

**断言（必须全部通过）**:
- 场景 A：runner 会把该 location 从 `pending_backfill` 提升为 `active`，并补写 `lastHeadAt` / `checksumVerifiedAt`
- 场景 B：runner 会保留 `pending_backfill`，仅刷新 `lastHeadAt`
- 场景 C：runner 会将该记录计入 `skipped`，且不会误 promotion
- worker 启动后会立即执行一次 verify，并按 interval 重复执行；上一轮未结束时不会并发重入
- runner 当前只负责 verify/promote，不代表已经完成真实跨 provider copy
- worker 子包自身的 standalone typecheck/build 必须保持通过

### O-04: 申请下载签名
**优先级**: P0 | **阶段**: 1

**断言（必须全部通过）**:
- 返回 `downloadUrl`
- 返回 `expiresAt`
- 非法 objectKey 不返回下载签名

### O-04b: 下载按 `primary -> replica/fallback -> resolver` 顺序命中候选位置
**优先级**: P0 | **阶段**: 1

**前置条件**:
- 对象存在且为可下载状态
- 场景 A：对象已有 active primary location，且对象在 primary binding 中存在
- 场景 B：对象已有 active primary location，但对象在 primary binding 中不存在；同时存在 active `replica` / `fallback` location，且对象在 secondary binding 中存在
- 场景 C：对象没有 storage location 记录

**断言（必须全部通过）**:
- 场景 A：下载路径优先使用 active primary location 对应 binding 创建下载请求
- 场景 B：当 primary `headObject=false` 时，继续尝试 active `replica` / `fallback` location，而不是直接跳到当前 resolver binding
- 场景 C：仅当 location 全缺失时，才 fallback 到 `resolver.resolve(projectKey, env, "object_storage")`
- 所有候选都 miss 时返回 404
- 不允许因 helper 引入而破坏既有下载 contract

### O-04c: 公共分发入口按 `primary -> replica/fallback -> resolver` 顺序命中候选位置
**优先级**: P0 | **阶段**: 1

**前置条件**:
- 对象为 `public-stable` 且状态为 active
- host / env 校验通过
- 场景 A：已有 active primary location，且对象在 primary binding 中存在
- 场景 B：已有 active primary location，但对象在 primary binding 中不存在；同时存在 active `replica` / `fallback` location，且对象在 secondary binding 中存在
- 场景 C：没有 storage location 记录

**断言（必须全部通过）**:
- 场景 A：`public-delivery` 优先使用 active primary location 对应 adapter 生成真实下载地址
- 场景 B：当 primary `headObject=false` 时，继续尝试 active `replica` / `fallback` location，而不是直接跳到当前 resolver binding
- 场景 C：仅当 location 全缺失时，才 fallback 到当前 resolver binding
- 所有候选都 miss 时返回 404
- 不允许把“当前 binding”继续当成历史对象的唯一物理位置真相源

### R-01: 创建 release
**优先级**: P0 | **阶段**: 1

**断言（必须全部通过）**:
- release 记录写入成功
- `distributionTarget` / `distributionUrl` / `semanticVersion` 正确保存
- 可记录 Android COS 分发或 iOS TestFlight 分发

### R-01b: `artifactObjectKey` 自动生成稳定公共 URL
**优先级**: P0 | **阶段**: 1

**前置条件**:
- CI 创建 Android / desktop release
- 未显式传入 `distributionUrl`
- `artifactObjectKey` 对应对象的访问策略为 `public-stable`

**断言（必须全部通过）**:
- Release Service 通过 delivery resolver 自动生成稳定公共 URL
- non-prod 命中 `https://dl-dev.infinex.cn/{objectKey}`
- prod 命中 `https://dl.infinex.cn/{objectKey}`
- route 内不再直接内联 `switch(env)` 作为唯一策略真相源

### R-01c: 非 `public-stable` 对象拒绝生成公共分发 URL
**优先级**: P0 | **阶段**: 1

**前置条件**:
- CI 或调用方传入的 `artifactObjectKey` 命中非 `public-stable` 对象
- 未显式提供 `distributionUrl`

**断言（必须全部通过）**:
- 系统拒绝为该对象自动生成稳定公共 URL，或返回空值并附带明确策略错误
- 不允许把 `private-signed` / `internal-signed` 对象伪装成公共下载链接

### R-02: 查询最新版本
**优先级**: P0 | **阶段**: 1

**断言（必须全部通过）**:
- 返回最新 semanticVersion
- 返回 distributionTarget / distributionUrl
- 返回 releaseNotes
- 返回 forceUpdate / minSupportedVersion（即使默认值为空也要结构正确）

### F-01: 提交 manual feedback 并持久化排障元信息
**优先级**: P0 | **阶段**: 1

**前置条件**:
- 提供合法 project token / projectKey
- 请求体包含 `deviceInfo`、`currentRoute`、`appVersion`、`buildNumber`、`attachments`、`metadata`

**断言（必须全部通过）**:
- `FeedbackSubmission` 写入 `deviceInfo`、`currentRoute`、`appVersion`、`buildNumber`，不得只把这些字段塞进 opaque metadata
- `deviceInfo` 保留调用方传入的手机型号、平台、系统版本、物理设备标识等 JSON 字段
- user-facing `GET /v1/feedback/submissions` 回显 route/version/build，供业务 App 反馈中心读取
- 缺失或非法 JSON 不得被默认值伪造；无法解析的字段按明确 null/错误语义处理

### F-02: feedback outbox 创建 GitHub issue 时输出完整 Metadata
**优先级**: P0 | **阶段**: 1

**前置条件**:
- 已存在 pending outbox job 与对应 manual `FeedbackSubmission`
- submission 含 `deviceInfo`、`currentRoute`、`appVersion`、`buildNumber`、`attachmentsJson`、`metadataJson`

**断言（必须全部通过）**:
- GitHub issue body 的 `## Metadata` JSON 包含 parsed `deviceInfo`
- `deviceInfo` 中的平台、型号、系统版本等字段不丢失
- `currentRoute`、`appVersion`、`buildNumber`、`attachments`、`metadata` 同时保留
- submission 无 `deviceInfo` 时 metadata 中显式为 `null`，不得伪造默认设备信息

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
