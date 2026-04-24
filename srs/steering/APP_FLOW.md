# 应用流程

## 用户旅程概述
`shared-runtime-services` 不是终端用户直接操作的产品，而是一个被业务项目、CI/CD 工作流和 admin-platform 调用的共享运行时服务层。

其主要流程围绕四类调用方展开：
1. **业务项目服务端**：申请对象上传/下载签名、查询稳定公共分发地址、删除对象、读取版本信息
2. **CI/CD 工作流**：上传安装包到正式对象存储、登记 release 元数据、回填 GitHub Release 文案与外链
3. **admin-platform**：查询版本、管理 rollout 状态、维护分发信息、审计对象记录
4. **反馈提交方 / 反馈控制面**：提交 feedback、查看 submission、重试 GitHub 同步、同步项目级 feedback 配置

## 核心流程

### 流程 1: Object 上传与登记
1. 业务项目后端或 CI 使用 project service token 调用 Object Service 申请上传签名。
2. shared-runtime-services 根据认证结果中的 `projectKey + runtimeEnv` 解析项目级 binding，并根据对象场景决定访问策略：公共长期分发、受控签名下载或内部访问。
3. 系统生成合法 `objectKey`，返回 uploadUrl / requiredHeaders / expiresAt。
4. 调用方直接把文件上传到对象存储 provider。
5. 上传成功后，调用方回调 `complete` 接口，登记对象元数据。
6. shared-runtime-services 记录对象元数据、访问策略与审计日志。

### 流程 2: 受控对象下载（签名 URL）
1. 业务项目后端或 admin-platform 传入 objectKey 请求下载签名。
2. shared-runtime-services 校验 project token、scope 和对象访问策略。
3. 仅当对象属于 `private-signed` 或 `internal-signed` 路径时，系统返回临时 downloadUrl。
4. 调用方使用临时 URL 完成下载；URL 到期后需要重新申请。

### 流程 3: 公共长期分发（稳定 URL）
1. 业务项目或 CI 创建的对象被归类为 `public-stable`（典型如 release artifact、公共资源、可长期引用的公开媒体）。
2. shared-runtime-services 根据对象元数据或 release 记录生成稳定公共 URL。
3. 稳定公共 URL 走共享分发入口（当前默认按环境使用 `dl-dev.infinex.cn` 与 `dl.infinex.cn`），而不是直接暴露项目 bucket 域名。
4. 当请求真正命中 `dl-dev.infinex.cn/{objectKey}` 或 `dl.infinex.cn/{objectKey}` 时，请求先进入 SRS 公共分发入口；系统校验对象存在、状态为 active、访问等级为 `public-stable`、且 host 与对象 env 匹配。
5. 校验通过后，SRS 再根据 `object.projectKey + object.env + object_storage binding` 解析底层 provider，并生成真实下载地址，以 302 redirect 形式把请求导向 provider 下载 URL。
6. 若后续需要更细的缓存策略、安全策略或独立分发面，可继续在该入口之后演进 CDN / gateway / 流式代理，但项目侧 contract 不变。

### 流程 3b: provider 迁移 playbook（共享 Storage / Delivery Plane）
1. 当某个项目或环境需要从旧 provider 迁移到新 provider（如 COS -> S3 / OSS / R2）时，先在项目协议层新增或预备新的 provider binding，不直接让调用方改 contract。
2. 迁移前先冻结对象键合同：`objectKey`、`public-stable` 稳定 URL、签名下载接口 contract 保持不变；迁移范围只落在 provider plane 与 delivery plane 内部。
3. 先进入双写阶段：新对象同时写旧 provider 与新 provider，数据库或治理表记录主副位置与迁移状态；若当前实现尚未支持自动双写，则至少先支持“写新 provider + 读旧 fallback”或批次迁移标记，不允许直接切断旧读路径。
4. 对存量对象执行回填：按项目 / 环境 / object profile 分批复制对象到新 provider，并对比 size、checksum、headObject 结果，确认迁移完整性。
5. 读路径切换采用灰度：公共稳定 URL 仍保持 `dl-dev` / `dl` 不变，SRS 在内部按已记录的物理落点顺序命中新 provider 或旧 provider；只有当前一候选被明确定义为不可用时，才继续尝试下一已登记候选位置。
6. 灰度期间持续观察：302 命中率、候选切换率、对象缺失率、错误率、回源耗时；未达标前不得宣称迁移完成。
7. 当新 provider 在目标项目 / 环境下连续稳定通过验收后，再停止双写并下线旧 provider 的候选读路径；旧对象最终清理必须单独审批，不与读流量切换同一时刻完成。
8. 若迁移中出现错误率上升、对象缺失或稳定 URL 异常，立即回滚到“旧 provider 主读 + 新 provider 停灰度”状态；由于用户侧稳定 URL 不变，回滚不应要求业务项目或终端用户改链接。

### 流程 4: Android / 桌面 Release 发布
1. GitHub Actions 构建 Android APK / AAB 或桌面安装包。
2. CI 调用 Object Service 获取 release 上传签名。
3. CI 将正式安装包上传到对象存储。
4. CI 调用 `complete` 登记对象元数据。
5. CI 调用 Release Service 创建 release，传入版本号、build 号、artifactObjectKey、release notes 等；CI register 的正式写入口必须是 SRS，而不是控制面本地表。
6. shared-runtime-services 根据 release 记录和共享分发策略生成稳定公共 `distributionUrl`。
7. GitHub Actions 创建 GitHub Release，但只写 release notes 与外部分发链接，不上传正式安装包。

#### Laicai 首接入切片（2026-04-11 已确认）
- 本轮只覆盖 Laicai 独立分支中的 `dev` Android release 主链路。
- 本轮“全量切换”仅指 release 相关读写全切到 shared-runtime-services：`upload -> complete -> release create -> latest/distributionUrl/download`。
- 本轮不为 `dev` 保留 legacy fallback 或兼容分支，目标是让问题直接暴露在 shared-runtime-services 接入链路上。
- 本轮不扩到用户头像、用户图片/媒体、业务中的发布需求图片、私有文档等非 release 对象域。
- `prod` 与现网 legacy 下载合同不在本轮范围内。

### 流程 5: iOS Release 发布
1. GitHub Actions 构建 IPA。
2. CI 上传 TestFlight。
3. CI 调用 Release Service 创建 release，记录 distributionTarget=TestFlight 与相关外链。
4. GitHub Release 仅承载说明和 TestFlight 链接，不承载 IPA。

### 流程 6: App 查询最新版本
1. 业务项目调用 Release Service 查询某项目某平台某环境的最新版本。
2. shared-runtime-services 返回 semanticVersion、forceUpdate、minSupportedVersion、distributionTarget、distributionUrl、releaseNotes。
3. 业务项目根据结果决定是否提示更新、是否强更、跳转到哪个下载 / 分发地址。

### 流程 6b: Feedback 提交与控制面处理
1. 业务项目调用 SRS feedback intake 接口提交 `manual / error / crash` submission。
2. SRS 写入 `feedback_submissions` 真相源，并按项目配置决定是否进入 GitHub issue outbox。
3. worker 扫描 outbox，统一执行 GitHub issue create / retry / backoff，并回写 submission 同步状态。
4. admin-platform 通过代理调用 SRS admin feedback API 查看 submission 列表、详情、GitHub issue 状态。
5. admin-platform 如需重试或批量处理 pending，只触发 SRS `retry/process-pending`，不本地伪造 submission 状态。

### 流程 7: admin-platform 控制面查询
1. admin-platform 使用 service token 调用 Release Service / Object Service / Feedback admin API 的管理接口。
2. 查询 release 列表、当前有效分发链接、对象元数据、feedback submission 与审计记录。
3. 控制面动作统一代理到 SRS；admin-platform 不再本地落 release 真相源或 feedback 真相源。
4. 后续支持调整 rollout 状态、强更开关、分发链接、对象治理动作与 feedback retry/process-pending。

## 访问策略决策表

| 场景 | 建议 object profile | 默认 access class | 出口策略 |
|------|---------------------|-------------------|----------|
| Android / 桌面安装包 | `release_artifact` | `public-stable` | 共享分发域名稳定 URL |
| 公开静态资源 | `public_asset` | `public-stable` | 共享分发域名稳定 URL |
| 可长期引用的公开媒体 | `public_media` | `public-stable` | 共享分发域名稳定 URL |
| 用户私有媒体 | `private_media` | `private-signed` | 临时签名 URL |
| 合同 / 发票 / 敏感文档 | `private_document` | `private-signed` | 临时签名 URL（更严格 TTL / 权限） |
| 备份 / 导出 / 运维归档 | `internal_archive` | `internal-signed` | 内部访问或短时签名 URL |

> 原则：不要把“固定 URL”与“签名 URL”混成同一条出口。固定 URL 用于公共长期分发；签名 URL 用于受控访问。

## 状态机

### Release 状态机
- `draft`：已登记但未正式对外启用
- `active`：当前有效版本
- `paused`：已创建但暂缓放量
- `deprecated`：已下线或不再推荐
- `rolled_back`：已回滚

### Object 状态机
- `pending_upload`：已申请上传签名，尚未完成上传
- `active`：对象已上传并登记元数据
- `deleted`：对象已被删除
- `invalid`：对象元数据异常或对象本体缺失，待治理

## 错误处理流程
- 非法 project token → 直接拒绝请求
- objectKey scope 不合法 → 拒绝生成签名或拒绝删除
- 试图为 `private-signed` / `internal-signed` 对象生成公共长期链接 → 拒绝或返回策略错误
- 上传成功但 complete 未登记 → 标记为待补录风险，后续由审计任务治理
- release 已存在但重复登记 → 走幂等保护或显式拒绝
- 公共下载域名仍绑定单一项目 bucket → 视为架构未完成，不应宣称共享分发能力已闭环

## 参考文档
- `steering/PROJECT_RULES.md` - 项目特定硬规则
- `steering/PRD.md` - 产品需求
- `steering/TECH_STACK.md` - 技术栈
