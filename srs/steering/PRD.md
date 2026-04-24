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
- Object Service 的访问策略要能表达至少 6 类对象场景：`release_artifact`、`public_asset`、`public_media`、`private_media`、`private_document`、`internal_archive`
- Object Service 的正式访问出口至少区分 3 类 access class：`public-stable`、`private-signed`、`internal-signed`
- `public-stable` 对象返回的是共享分发层上的稳定 URL，不是项目 bucket / provider host 直接暴露出来的长期合同
- Phase 1 默认生产 provider 为腾讯云 COS，但架构允许后续切换到 S3 / OSS / R2 / MinIO-compatible 等对象存储供应商

### F2: Release Service
**用户故事：** 作为 CI 或 admin-platform，我想登记各项目各平台的发布版本和分发链接，以便构建、分发、强更和外部 release notes 都基于统一真相源。

**验收标准：**
- 支持登记 Android / iOS / 桌面端 release 元数据
- 支持查询某项目某平台的最新版本
- 支持维护 rollout 状态、强更开关和最低支持版本
- GitHub Release 只回填 release notes 与外部分发链接，不上传正式二进制
- Android / 桌面安装包默认归类为 `release_artifact + public-stable`
- iOS 正式分发默认走 TestFlight，不与对象存储下载出口混用
- `distributionUrl` 的正式真相源来自共享分发策略，而不是业务仓库里手写 bucket URL 或项目级 CDN 映射

### F3: 控制面接入基础
**用户故事：** 作为 admin-platform，我想查询 release 列表、有效分发链接和对象审计信息，以便运营台成为统一控制面，而不是每个项目各自拼接后台。

**验收标准：**
- 能查询 release 列表与当前有效版本
- 能看到 distributionTarget / distributionUrl / rolloutStatus
- 能查询对象元数据与对象审计记录
- 控制面与运行时边界清晰，不把 admin-platform 当作运行时真相源

### F4: Feedback Runtime 收口
**用户故事：** 作为业务项目或 admin-platform，我希望 feedback submission、GitHub Issue 同步、修复验证与状态生命周期统一收口到 shared-runtime-services，这样反馈真相源、执行器与控制面语义保持一致，不再分散在业务仓库、本地表和临时脚本中。

**验收标准：**
- SRS 成为 feedback submission 真相源，至少覆盖 `manual` / `error` / `crash` 三类 channel
- SRS 提供 admin feedback API，支持 submission 列表、详情、retry / process-pending、project config 管理
- SRS worker 统一执行 GitHub issue create / retry / backoff，不再把执行权留在 admin-platform 或业务后端
- admin-platform 只作为 feedback control plane viewer / proxy，不再本地伪造反馈状态流转
- feedback fix / verify 生命周期由 SRS 直接承接，避免控制面与运行时状态漂移

### F5: 项目协议层
**用户故事：** 作为 shared-runtime-services，我想让接入项目通过统一项目协议声明自身身份、运行环境与共享能力绑定，以便运行时根据 `projectKey + runtimeEnv + serviceType` 自动解析正确的 provider 配置和资源，而不是在每个项目里散落 bucket、provider 与凭据细节。

**验收标准：**
- 支持以认证结果中的 `projectKey + runtimeEnv` 作为项目/环境身份真相源
- 支持通过 `ProjectManifest` 记录项目注册状态
- 支持通过 `ProjectServiceBinding` 记录某项目某运行环境某共享能力的 provider 与资源绑定
- 运行时根据 `projectKey + runtimeEnv + serviceType` 解析 binding，并创建对应 adapter 实例
- 请求体中的 `project` / `env` 只做一致性校验，不作为最终资源路由真相源
- 未注册项目、未绑定目标共享能力或环境不匹配时返回明确协议错误，而不是静默回退为全局单例配置

### F6: Shared Delivery Plane
**用户故事：** 作为 CI、业务项目或控制面，我想让稳定公共下载地址属于共享分发层，而不是直接绑定到某个项目 bucket，这样多个项目可以复用同一批正式下载域名，未来更换底层对象存储供应商时也不需要改用户侧链接。

**验收标准：**
- `dl-dev.infinex.cn` 与 `dl.infinex.cn` 被定义为环境级共享公共分发入口，而不是某个项目 bucket 的长期别名
- `public-stable` 对象可从对象元数据 / `artifactObjectKey` 解析出稳定公共 URL
- `private-signed` / `internal-signed` 对象不得复用上述稳定公共下载域名作为正式长期出口
- 如果后续发现缓存策略、安全策略或业务场景不够，允许继续在 `*.infinex.cn` 下扩展更多公共分发域名，而不修改项目 contract
- 底层 provider 迁移应支持双写、回填、读 fallback 或灰度切换，且尽量保持用户侧稳定 URL 不变
- 当前 Phase 4 最小生产闭环允许 shared prefix 先通过 CDN + Nginx bridge + SRS 实现；后续迁移到新 provider 时，仍以“不改项目 contract、不改用户链接”为首要约束

### F7: Provider-neutral 迁移能力
**用户故事：** 作为共享运行时维护者，我想在不打断项目侧调用和用户侧下载入口的前提下，把对象从 COS 迁移到 S3 / OSS / R2 等其他 provider，以便真正做到 provider-neutral，而不是文档上说可迁移、实际上只能硬切。

**验收标准：**
- 迁移方案必须至少覆盖 `prepare / dual-write / backfill / read fallback / gradual cutover / rollback / finalize` 七个阶段
- 迁移期间项目侧仍继续按 `projectKey + runtimeEnv` 调用，不新增 bucket/provider 参数
- `public-stable` 稳定 URL 与 `private-signed` / `internal-signed` 下载接口在迁移期间 contract 不变
- 回滚必须可在共享运行时内部完成，不要求业务项目发版或用户改链接
- 迁移完成的判断必须基于真实验收证据，而不是“binding 已改”这类配置层结论

## 首条真实接入 MVP 边界（2026-04-11 已确认）

### In Scope
- Laicai 独立分支内的 `dev` 环境
- Android release 主链路的 release 相关对象域：APK / AAB / 安装包等 `release_artifact`
- Release 写侧：upload request、complete、release create
- Release 读侧：latest release、distributionUrl、dev 下载 / 分发主路径
- dev 路径直接以 shared-runtime-services 为唯一真相源，不做 fallback，不兼容 legacy

### Out Of Scope
- `prod` 环境
- 用户头像、用户上传图片 / 媒体
- 业务中的发布需求图片
- 私有文档 / 附件与其他非 release 对象域
- InfoV 接入
- 现网 legacy 下载合同的调整、迁移或删除

### 当前切片验收标准
- 在 Laicai `dev` 独立分支中，release 主链路读写全部命中 shared-runtime-services
- Android `dev` 发布产物可完成 `upload -> complete -> release create -> latest/distributionUrl 消费` 的闭环
- `dev` 运行路径不再依赖 legacy backend 真相源
- 问题应直接暴露在 shared-runtime-services 接入链路上，而不是被兼容层掩盖
- `prod` 与现网正式下载路径不受本轮切片影响

## MVP 明确排除的功能
- 完整的 AI Service Layer
- 完整的 Domain / Certificate 自动化系统
- 多租户计费与对外 SaaS 化
- 全量 UI 控制台实现
- 所有历史项目一次性迁移完成
- Phase 1 内一次性重构所有历史对象 key 与所有历史下载链接

## 非功能需求
- 使用 Docker Compose 启动最小运行环境
- 运行时服务主栈采用 TypeScript / Node.js / Fastify
- PostgreSQL 作为主真相源，Redis 作为可选缓存 / 队列 / 幂等层
- 对象存储通过 provider adapter 抽象，Phase 1 默认生产 provider 为腾讯云 COS，但后续可切换到其他对象存储供应商
- 公共下载出口与底层存储 provider 分层建模；公共长期 URL 不直接依赖 provider host
- 服务需要具备 project-level service token 鉴权能力
- 所有关键写操作具备审计日志能力
- 文档先行，需求 / 方案 / 计划必须先写入 `steering/` 再实施

## 成功标准
- 至少两个项目可共享同一套 Object / Release 契约，而不在各自仓库重复维护存储和分发真相源
- `dl-dev.infinex.cn` / `dl.infinex.cn` 这类稳定公共下载入口可以面向多个项目复用，而不是继续绑定单一项目 bucket
- 受控对象下载仍通过签名 URL，公共长期分发与受控下载出口边界清晰
- GitHub Release link-only 规则被系统化落实
- feedback/version 两类 runtime 真相源统一收口到 SRS，admin-platform 退回 control plane / proxy
- provider 迁移路径在文档和实施计划中可见，未来从 COS 切到其他供应商时不需要让用户改下载入口

## 参考文档
- `steering/PROJECT_RULES.md` - 项目特定硬规则
- `steering/APP_FLOW.md` - 用户流程
- `steering/TECH_STACK.md` - 技术栈
