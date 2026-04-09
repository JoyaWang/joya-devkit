# 应用流程

## 用户旅程概述
`shared-runtime-services` 不是终端用户直接操作的产品，而是一个被业务项目、CI/CD 工作流和 admin-platform 调用的共享运行时服务层。

其主要流程围绕三类调用方展开：
1. **业务项目服务端**：申请对象上传/下载签名、删除对象、读取版本信息
2. **CI/CD 工作流**：上传安装包到正式对象存储、登记 release 元数据、回填 GitHub Release 文案与外链
3. **admin-platform**：查询版本、管理 rollout 状态、维护分发信息、审计对象记录

## 核心流程

### 流程 1: Object 上传与登记
1. 业务项目后端或 CI 使用 project service token 调用 Object Service 申请上传签名。
2. shared-runtime-services 根据 project、env、domain、scope、entityId、fileKind 生成合法 objectKey，并返回 uploadUrl / requiredHeaders / expiresAt。
3. 调用方直接把文件上传到 COS（或本地开发环境的兼容对象存储）。
4. 上传成功后，调用方回调 `complete` 接口，登记对象元数据。
5. shared-runtime-services 记录对象元数据与审计日志。

### 流程 2: Object 下载与删除
1. 业务项目后端或 admin-platform 传入 objectKey 请求下载签名。
2. shared-runtime-services 校验 project token 与 scope 合法性。
3. 系统返回临时 downloadUrl。
4. 如需删除对象，调用删除接口；系统校验 scope 后删除对象并写入审计记录。

### 流程 3: Android Release 发布
1. GitHub Actions 构建 Android APK / AAB。
2. CI 调用 Object Service 获取 release 上传签名。
3. CI 将正式安装包上传到 COS / Object Service。
4. CI 调用 Release Service 创建 release，写入版本号、build 号、objectKey、distributionUrl、release notes 等。
5. GitHub Actions 创建 GitHub Release，但只写 release notes 与外部分发链接，不上传安装包。

### 流程 4: iOS Release 发布
1. GitHub Actions 构建 IPA。
2. CI 上传 TestFlight。
3. CI 调用 Release Service 创建 release，记录 distributionTarget=TestFlight 与相关外链。
4. GitHub Release 仅承载说明和 TestFlight 链接，不承载 IPA。

### 流程 5: App 查询最新版本
1. 业务项目调用 Release Service 查询某项目某平台某环境的最新版本。
2. shared-runtime-services 返回 semanticVersion、forceUpdate、minSupportedVersion、distributionTarget、distributionUrl、releaseNotes。
3. 业务项目根据结果决定是否提示更新、是否强更、跳转到哪个下载 / 分发地址。

### 流程 6: admin-platform 控制面查询
1. admin-platform 使用 service token 调用 Release Service / Object Service 的管理查询接口。
2. 查询 release 列表、当前有效分发链接、对象元数据和审计记录。
3. 后续支持调整 rollout 状态、强更开关、分发链接和对象治理动作。

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
- 上传成功但 complete 未登记 → 标记为待补录风险，后续由审计任务治理
- release 已存在但重复登记 → 走幂等保护或显式拒绝
- distributionUrl 缺失 → 允许创建记录，但 GitHub Release 只写“本次未填写链接”，不能退回上传二进制到 GitHub

## 参考文档
- `steering/PROJECT_RULES.md` - 项目特定硬规则
- `steering/PRD.md` - 产品需求
- `steering/TECH_STACK.md` - 技术栈
