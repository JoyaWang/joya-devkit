# 产品需求文档

## 产品名称
**shared-runtime-services** — 面向 InfoV、Laicai 及后续活跃项目的共享运行时服务底座。

## 目标用户

### 直接用户
- 各业务项目的后端 / Server Adapter
- 各项目的 CI/CD 工作流
- `admin-platform` 运营后台
- 后续接入共享能力的新项目

### 间接受益用户
- 使用 InfoV、Laicai 等业务产品的终端用户
- 负责版本发布、对象治理、分发和运维的内部团队

## MVP 功能范围

### F1: Object Service
**用户故事：** 作为业务项目后端或 CI，我想申请上传/下载签名并统一登记对象元数据，以便所有项目都遵守同一套对象存储契约，而不是各自维护一套绑定单一供应商的对象存储逻辑。

**验收标准：**
- 支持生成上传签名请求
- 支持生成下载签名请求
- 支持对象上传完成后的元数据登记
- 支持按规则删除合法对象
- 支持统一 objectKey 规范与 scope 校验
- 支持记录对象的元数据和审计信息
- Object Service 内部通过 provider adapter 对接具体对象存储供应商，上层 contract 不直接绑定 COS SDK
- Object Service 通过项目协议层按 `projectKey + runtimeEnv + serviceType` 解析项目级存储资源绑定，调用方只暴露项目/环境身份，不直接传 bucket / provider / region 等底层细节
- Phase 1 默认生产 provider 为腾讯云 COS，但架构允许后续切换到其他对象存储供应商

### F2: Release Service
**用户故事：** 作为 CI 或 admin-platform，我想登记各项目各平台的发布版本和分发链接，以便构建、分发、强更和外部 release notes 都基于统一真相源。

**验收标准：**
- 支持登记 Android / iOS / 桌面端 release 元数据
- 支持查询某项目某平台的最新版本
- 支持维护 rollout 状态、强更开关和最低支持版本
- GitHub Release 只回填 release notes 与外部分发链接，不上传正式二进制
- Android 默认走 COS / Object Service；iOS 默认走 TestFlight

### F3: 控制面接入基础
**用户故事：** 作为 admin-platform，我想查询 release 列表、有效分发链接和对象审计信息，以便运营台成为统一控制面，而不是每个项目各自拼接后台。

**验收标准：**
- 能查询 release 列表与当前有效版本
- 能看到 distributionTarget / distributionUrl / rolloutStatus
- 能查询对象元数据与对象审计记录
- 控制面与运行时边界清晰，不把 admin-platform 当作运行时真相源

### F4: 项目协议层
**用户故事：** 作为 shared-runtime-services，我想让接入项目通过统一项目协议声明自身身份、运行环境与共享能力绑定，以便运行时根据 `projectKey + runtimeEnv + serviceType` 自动解析正确的 provider 配置和资源，而不是在每个项目里散落 bucket、provider 与凭据细节。

**验收标准：**
- 支持以认证结果中的 `projectKey + runtimeEnv` 作为项目/环境身份真相源
- 支持通过 `ProjectManifest` 记录项目注册状态
- 支持通过 `ProjectServiceBinding` 记录某项目某运行环境某共享能力的 provider 与资源绑定
- 运行时根据 `projectKey + runtimeEnv + serviceType` 解析 binding，并创建对应 adapter 实例
- 请求体中的 `project` / `env` 只做一致性校验，不作为最终资源路由真相源
- 未注册项目、未绑定目标共享能力或环境不匹配时返回明确协议错误，而不是静默回退为全局单例配置

## MVP 明确排除的功能
- 完整的 AI Service Layer
- 完整的 Feedback / Crash Service
- 完整的 Domain / Certificate 自动化系统
- 多租户计费与对外 SaaS 化
- 全量 UI 控制台实现
- 所有历史项目一次性迁移完成

## 非功能需求
- 使用 Docker Compose 启动最小运行环境
- 运行时服务主栈采用 TypeScript / Node.js / Fastify
- PostgreSQL 作为主真相源，Redis 作为可选缓存 / 队列 / 幂等层
- 对象存储通过 provider adapter 抽象，Phase 1 默认生产 provider 为腾讯云 COS，但后续可切换到其他对象存储供应商
- 服务需要具备 project-level service token 鉴权能力
- 所有关键写操作具备审计日志能力
- 文档先行，需求 / 方案 / 计划必须先写入 `steering/` 再实施

## 成功标准
- InfoV 可通过 Object Service 申请上传 / 下载签名
- 至少一个项目的发布工作流可通过 Release Service 写入版本真相源
- GitHub Release link-only 规则被系统化落实
- admin-platform 后续可直接基于共享接口接控制面

## 参考文档
- `steering/PROJECT_RULES.md` - 项目特定硬规则
- `steering/APP_FLOW.md` - 用户流程
- `steering/TECH_STACK.md` - 技术栈
