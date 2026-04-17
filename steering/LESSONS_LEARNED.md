# 经验教训

> AI 每次会话应读取此文件，避免重复犯错。
> 项目特定经验写在这里；跨项目通用经验写入 `shared_memories/经验教训登记册.md`。

## 记录规则

- 每条记录只沉淀一个明确教训，标题尽量短。
- 重点写清问题、根因、解法和最终沉淀出的规则。
- 如果这条经验已经提升为共享规则或项目规则，要在“规则”字段标明去向。

## 标准记录格式

### YYYY-MM-DD: [简短标题]
- **问题**：遇到了什么问题
- **根因**：根本原因是什么
- **解法**：最终如何解决
- **规则**：由此沉淀的规则；如已写入其他文档，注明位置

## 示例条目

### 2025-01-15: [简短标题]
- **问题**：描述遇到的问题
- **根因**：分析根本原因
- **解法**：最终的解决方案
- **规则**：由此新增的规则 → 已写入 `steering/PROJECT_RULES.md` 的 [章节名]

---

## 记录

### 2026-04-09: API 子目录启动时不要假设 dotenv 会自动命中项目根
- **问题**：`apps/api` 从子目录启动后，虽然项目根 `.env` 已存在，服务仍然返回 `invalid token`
- **根因**：原实现只依赖 `import "dotenv/config"`，默认只读取当前工作目录下的 `.env`；同时 `EnvTokenValidator` 在模块初始化时就缓存了 `SERVICE_TOKENS`
- **解法**：新增 `apps/api/src/env.ts` 主动向上查找项目根 `.env`；并将 `EnvTokenValidator` 改为 validate 时动态读取环境变量
- **规则**：多包 monorepo 的子应用如果依赖项目根 `.env`，必须显式实现 env 搜索/加载逻辑，不能把 dotenv 默认行为当成稳定契约

### 2026-04-09: 共享 provider 迁移优先做双模式而不是一次性硬切
- **问题**：Object Service 需要从 placeholder COS 过渡到真实 COS，如果直接硬切，未配置凭据的开发/测试环境会被破坏
- **根因**：共享 runtime 项目既要支持真实生产能力，又要兼容迁移中的环境，不能假设所有环境同时具备完整密钥
- **解法**：让 `CosObjectStorageAdapter` 优先走真实 `cos-nodejs-sdk-v5`，但在凭据缺失时自动回退 placeholder fallback
- **规则**：共享基础设施能力从 mock/placeholder 迁移到 real provider 时，默认优先采用“配置驱动的双模式迁移”，避免一次性破坏所有环境

### 2026-04-09: 项目协议层的错误语义必须拆开验证
- **问题**：首次 E2E 只验证了一个“未接通项目”场景，结果把 `service_binding_missing` 和 `project_not_registered` 混成了一类断言
- **根因**：项目协议层引入后，"项目已注册但未绑定服务" 与 "项目根本未注册" 已经是两种不同的契约错误，但测试数据和断言没有同步细分
- **解法**：在 seed / token / E2E 中同时保留 `unbound` 与 `ghost` 两类项目，分别验证 `service_binding_missing` 与 `project_not_registered`
- **规则**：凡是共享运行时引入协议层状态机后，测试必须按错误语义逐类覆盖，不能只测一个模糊的失败场景

### 2026-04-09: 仅按 projectKey 路由不够，多环境必须进入正式协议
- **问题**：首轮项目协议层虽然解决了“不同项目命中不同 bucket”，但仍默认同一项目只有一条 object_storage binding，无法覆盖 dev / prd 各自不同 bucket 的真实生产形态
- **根因**：把环境维度留在 objectKey 或请求体里，却没有进入 binding 真相源与认证真相源，导致资源路由仍然不完整
- **解法**：将正式协议升级为 `projectKey + runtimeEnv + serviceType`，并把 `runtimeEnv` 纳入 token 解析、binding 唯一键、resolver、factory cache key 与 E2E 覆盖
- **规则**：以后任何共享运行时服务只要涉及不同环境命中不同底层资源，必须把环境维度写进正式协议层，不能只在请求体或命名约定里临时携带

### 2026-04-09: 必填新列上线时，优先走“补列→回填→收紧约束”的增量迁移
- **问题**：本地数据库已有旧 `project_service_bindings` 数据时，Prisma 直接 `db push` 无法为新增必填列 `runtime_env` 落地，因为存量行没有默认值
- **根因**：把“schema 设计完成”误当成“数据库迁移可直接执行”，忽略了存量数据过渡步骤
- **解法**：先增量补列并允许空值，回填旧数据到安全默认环境（本轮为 `dev`），再切换为 `NOT NULL` 并升级唯一键，最后再运行新 seed
- **规则**：以后共享运行时的协议层字段升级只要碰到存量数据，就优先设计 non-destructive migration path，禁止为了省事直接 reset 本地数据库

### 2026-04-09: binding 更新后，运行中的 adapter cache 不是自动刷新的
- **问题**：把 `laicai/prd` 的 bucket 从 dev 桶改为真实 prd 桶并重新 seed 后，首轮 E2E 仍继续命中旧 dev bucket，看起来像协议路由失败
- **根因**：真正的问题不是 resolver 或 binding 查询错了，而是运行中的 API 进程已经通过 `ObjectStorageAdapterFactory` 缓存了旧 adapter；数据库 binding 更新不会自动让进程内 cache 失效
- **解法**：确认 seed 成功后，重启 API 进程并重新执行 E2E；重启后 `laicai/prd` 立即命中真实 prd bucket，59/59 断言通过
- **规则**：以后共享运行时只要采用进程内 adapter/cache 复用，任何 binding/provider 配置变更验证前都必须显式刷新进程或提供 cache invalidation 机制，不能默认认为“改库后运行中实例会自动拿到新配置”

### 2026-04-10: Worker 型容器必须显式保持事件循环活跃
- **问题**：生产服务器上 `infra-worker-1` 持续 `Restarting (0)`，日志只重复打印 `started, waiting for tasks...`，看起来像“已启动”但实际上容器一直在重启
- **根因**：worker 入口只有启动日志和信号处理器，没有任何长生命周期任务；Node 进程因此以 `exit=0` 立即退出，Docker 依据 restart policy 不断重启容器
- **解法**：先用 `tests/worker-lifecycle.test.mts` 把“启动后至少存活 2 秒”和“收到 SIGTERM 优雅退出”两个行为写成失败测试，再在 `apps/worker/src/index.ts` 中增加最小 keep-alive `setInterval`，并在 shutdown 时清理它
- **规则**：以后任何 Worker / Daemon / Queue consumer 型入口都必须有生命周期测试，且实现上要么接入真实消费循环，要么显式保持事件循环活跃；只打印 `started` 日志不代表容器能持续运行

### 2026-04-10: 用 `git archive HEAD` 部署时，未提交热修复不会进入服务器
- **问题**：本地已经修好 worker 快速退出问题，但服务器重建后仍继续跑旧代码，导致误以为热修复无效
- **根因**：部署同步使用的是 `git archive HEAD | ssh tar`，它只会导出已提交树；本地未提交的 `apps/worker/src/index.ts` 与新增测试文件不会被带到远端
- **解法**：先确认 `git status` 中确实存在未提交热修复，再显式用 `scp` 同步工作区文件到服务器后重建；之后 worker 立即稳定 `Up`
- **规则**：以后凡是采用归档同步或基于提交树的部署方式，必须先确认目标修复已提交；如果还处于未提交热修复阶段，就必须显式同步工作区文件并在部署后核对远端源码/镜像内容

### 2026-04-10: 腾讯 CDN 的 directory 回源规则不要写尾斜杠
- **问题**：为 `dl-dev.infinex.cn` / `dl.infinex.cn` 配置 shared prefix 回源时，`Origin.PathBasedOrigin` 多次返回格式错误，导致共享入口迟迟不能切流
- **根因**：腾讯 CDN 的 `RuleType=directory` 对 `RulePaths` 的真实格式要求比文档更严格；`/infov/`、`/laicai/` 这类尾斜杠写法会被判定为不合法或无法稳定生效
- **解法**：最终使用不带尾斜杠的目录规则：`["/infov", "/laicai"]`
- **规则**：以后腾讯 CDN 的 directory 级高级回源规则默认使用不带尾斜杠的目录前缀；命中异常时优先先检查 `RulePaths` 格式，而不是先怀疑后端服务

### 2026-04-16: admin-platform 是唯一环境配置真相源，禁止在下游写死 fallback
- **问题**：`cloudbaserc.json` 中被直接写入了 `PROJECT_KEY: "laicai"` 和 `SRS_API_URL`/`SRS_PUBLIC_DOMAIN`/`SRS_SERVICE_TOKEN` 的静态值，绕过了 `pull-infra-env.js` 的统一拉取机制
- **根因**：admin-platform 的 `infra_env_bundle` Edge Function 默认返回里缺少 `PROJECT_KEY` 和 SRS 占位字段，导致为了快速修复直接在 Laicai backend 写死配置
- **解法**：在 admin-platform `DEFAULT_RUNTIME_CONFIG_BY_ENV` 的 dev/stg/prd 中加入 `PROJECT_KEY`、`SRS_API_URL`、`SRS_PUBLIC_DOMAIN`、`SRS_SERVICE_TOKEN` 默认值占位；重新部署 `infra_env_bundle` Edge Function；将 `cloudbaserc.json` 改回 `{{env.XXX}}` 占位符；移除 `pull-infra-env.js` 中特殊注入 `PROJECT_KEY` 的 workaround
- **规则**：任何共享运行时/业务项目的 env 配置必须通过 admin-platform Infra bundle 注入，禁止在 `cloudbaserc.json`、workflow 或脚本中写死环境相关常量 → 已写入 `progress.md`

### 2026-04-16: SRS Object Service 协议层新增必填字段时，必须同步检查所有转发层和 E2E 调用方
- **问题**：SRS `upload-requests` 校验新增 `fileKind` 必填后，Laicai 的 Flutter E2E 测试通过 CloudBase `storage` 函数转发时返回 500，但直接 curl SRS 是通的
- **根因**：`storage` 函数的 `srs-client.js` 直接透传 `fileKind`（值为 `undefined`），导致 SRS 返回 400；而 CloudBase 函数把所有 axios 异常统一 catch 成 500，掩盖了真实错误语义。Flutter 侧旧调用点也没有传 `fileKind`
- **解法**：在 `srs-client.js` 增加 `inferFileKind` 兜底推断（`image`/`video`/`audio`/`document`/`file`），让转发层对缺失字段做安全兼容；同时修复 Flutter `UploadService` 显式传入 `fileKind`
- **规则**：以后 SRS 协议层引入新的必填字段时，必须同时更新：1) 服务端 schema；2) 所有业务后端转发层（srs-client）；3) 所有前端/SDK 调用点；4) E2E 测试数据。不能只改 SRS 服务端就认为升级完成

### 2026-04-16: Flutter UploadService 参数必须与后端 storage contract 严格对齐
- **问题**：手动 curl 验证了 SRS storage API 链路，但 Flutter app 真实上传头像/帖子图片时仍失败
- **根因**：`UploadService.getUploadInfo()` 只传了 `fileName` + `contentType`，但后端 `storage` 函数强制要求 `domain`、`scope`、`size`；缺少任一字段即返回 400 `MISSING_FIELDS`
- **解法**：修改 Flutter `UploadService` 在上传请求中显式传入 `domain`、`scope`、`size`；`ProfileService.uploadAvatar` 传 `domain='member'`, `scope='avatar'`；`ImageUploadWidget` 传 `domain='post'`, `scope='attachment'`；KYC 实名认证传 `domain='member'`, `scope='identity'`
- **规则**：后端 API 契约变更后，必须同步检查所有前端调用点，不能只测 API 层就认为 E2E 通过 → 已写入 `progress.md`

### 2026-04-10: 腾讯 CDN 的域名 origin 方案未收口前，不要替代当前稳定 IP origin
- **问题**：虽然腾讯 CDN 配置中可以把 shared prefix 的 `Origin` 写成 `srs.infinex.cn`，但公网实际访问 shared objectKey 时仍可能回落到旧 COS 默认源站，表现为 `Server: tencent-cos` 的 404
- **根因**：当前“域名 origin -> Nginx bridge -> SRS”的公网行为并不稳定，说明 CDN 对该配置的真实回源行为还有未收口因素；问题不在 SRS route 或宿主机 Nginx 本身
- **解法**：将共享前缀回退并固定为 `Origin=["124.222.37.77"]`，再通过宿主机 Nginx + `Tencent-Acceleration-Domain-Name` 头桥接到 SRS；回退后 shared prefix 公网稳定恢复 302
- **规则**：在域名 origin 的根因未明确之前，`dl-dev` / `dl` 的生产 shared prefix 回源以 `124.222.37.77` 为当前稳定方案；禁止把 `Origin=["srs.infinex.cn"]` 当作已完成、可直接替代的生产结论