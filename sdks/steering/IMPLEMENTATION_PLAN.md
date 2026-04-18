# IMPLEMENTATION_PLAN: joya-flutter-kits

## 阶段概览

| 阶段 | 内容 | 预估任务数 |
|------|------|-----------|
| P0 | 基础设施（joya_result, joya_auth, joya_http） | 8 |
| P1 | 版本更新（joya_version_kit） | 3 |
| P2 | 反馈上报（joya_logger, joya_device, joya_feedback_kit） | 6 |

## P0 任务明细

### 1.1 项目骨架搭建
- 初始化 melos workspace
- 创建 7 个包的 pubspec.yaml 和目录结构
- 配置 melos.yaml（bootstrap、analyze、test 脚本）
- 创建 .gitignore

**验收标准**：
- [ ] `melos bootstrap` 成功
- [ ] `melos analyze` 零错误
- [ ] 目录结构完整

### 1.2 joya_result
- 从 Laicai `domain/result.dart` 提取
- 通用化：去掉 Laicai 前缀，保持 API 不变
- 写单元测试
- 写 README.md

**验收标准**：
- [ ] Result.success / Result.failure 构造正确
- [ ] fold() 分支正确
- [ ] getOrThrow() 成功返回值、失败抛异常
- [ ] 单元测试通过

### 1.3 joya_auth
- 从 Laicai `TokenService` 提取
- 通用化：
  - 去掉硬编码 storage key 前缀（改为可配置 prefix）
  - 去掉 Laicai 特定的 JWT 解析（hasura claims 等改为可选 debug 扩展点）
  - 保留核心：FlutterSecureStorage + 内存缓存 + restoreCache + forceLogout 流
- 写单元测试（Mock FlutterSecureStorage）
- 写 README.md

**验收标准**：
- [ ] Token 安全存储（set/get/clear）
- [ ] 内存缓存同步访问器（cachedAccessToken 等）
- [ ] restoreCache() 启动恢复
- [ ] forceLogout() 清除 + 通知流
- [ ] saveAuthTokens() 批量保存
- [ ] 可配置 key prefix

### 1.4 joya_http
- 从 Laicai `AuthInterceptor` + `api_endpoints.dart` 提取
- 通用化：
  - AuthInterceptor 依赖 joya_auth 的 TokenService 抽象接口
  - soft401 检测逻辑通用化（错误码可配置）
  - ApiResponse<T> 包装类
  - Dio 工厂方法
- 写单元测试
- 写 README.md

**验收标准**：
- [ ] Dio 实例创建（含默认配置）
- [ ] Auth 拦截器注入 Bearer token
- [ ] soft401 检测 + 转换
- [ ] Token 自动刷新（用 refreshDio 避免循环）
- [ ] 刷新成功后重试原请求
- [ ] 刷新失败触发 forceLogout
- [ ] skipAuth 标记跳过认证
- [ ] ApiResponse<T> 包装

## P1 任务明细

### 2.1 joya_version_kit — 数据模型
- AppVersionInfo 模型（从 Laicai 提取，去掉 Laicai 前缀）
- AppVersionResponse JSON 模型
- UpdateConfig / UpdateStrategy 枚举
- DownloadProgress 模型

**验收标准**：
- [ ] 模型可序列化/反序列化
- [ ] 字段完整（platform, channel, latestVersion, forceUpdate, rolloutPercent 等）

### 2.2 joya_version_kit — 版本检查逻辑
- VersionCheckService：调用 SRS `/v1/releases/latest` API
- 灰度判断：hashToBucket 算法（从 Laicai 后端 JS 迁移到 Dart）
- 设备 ID 生成与持久化（从 Laicai VersionRepositoryImpl 提取）
- 忽略版本记录

**验收标准**：
- [ ] 调用 API 获取最新版本信息
- [ ] 灰度 hash 正确判断当前设备是否在发布范围
- [ ] 设备 ID 首次生成后持久化
- [ ] 忽略版本功能正常

### 2.3 joya_version_kit — UI 组件
- AppUpdateDialog（从 Laicai 提取，通用化主题）
- 后台下载服务（BackgroundDownloadService）
- 安装服务（Android APK / iOS App Store）
- 进度展示

**验收标准**：
- [ ] 更新弹窗正确展示版本信息和更新日志
- [ ] 强制更新时不可关闭
- [ ] Android APK 下载进度展示
- [ ] iOS 跳转 App Store
- [ ] UI 主题可被项目 override

## P2 任务明细

### 3.1 joya_logger — FileRotationOutput
- 从 Laicai 提取，去掉 Laicai 特定逻辑
- 保留：按小时文件名、保留期自动清理、时间范围查询
- 可配置：保留天数、日志目录名

**验收标准**：
- [ ] 日志按小时写入文件
- [ ] 超过保留期的文件自动删除
- [ ] getLogsForRange() 返回正确时间范围的日志
- [ ] 可配置保留天数

### 3.2 joya_logger — MemoryOutput + LogLineSanitizer + LogCleanupService
- FeedbackMemoryOutput：环形缓冲
- LogLineSanitizer：ANSI 去除、PrettyPrinter 框线过滤、UTF-8 清洗
- LogCleanupService：去重、分隔线过滤、大小限制

**验收标准**：
- [ ] 内存缓冲容量限制正确（FIFO）
- [ ] 日志清洗去除 ANSI 码和框线
- [ ] 日志清理服务去重、限大小

### 3.3 joya_device
- 从 Laicai DeviceInfoCollector 提取
- 通用化：去掉 Laicai 特定逻辑
- Android/iOS 全量设备信息

**验收标准**：
- [ ] Android 设备信息完整（model, os, manufacturer, brand, sdkInt 等）
- [ ] iOS 设备信息完整（model, os, name, localizedModel 等）
- [ ] PackageInfo 缓存
- [ ] getAppVersion / getBuildNumber / getFullVersion

### 3.4 joya_feedback_kit — 崩溃上报
- CrashReporterService 从 Laicai 提取
- 通用化：API endpoint 可配置、存储 key 可配置
- 保留：持久化→即时上报→启动补报、去重窗口

**验收标准**：
- [ ] reportCrash() 收集完整崩溃信息
- [ ] 持久化到 SharedPreferences
- [ ] 即时上报 + 启动补报
- [ ] 8 秒去重窗口
- [ ] gzip 压缩上报

### 3.5 joya_feedback_kit — 错误上报
- ErrorReporterService + ErrorReportingOutput 从 Laicai 提取
- 通用化：过滤规则可配置
- 保留：去重 5 分钟、限流 10/min、批量 5 秒、远程开关

**验收标准**：
- [ ] 只拦截 Level.error 日志
- [ ] 去重、限流、批量逻辑正确
- [ ] 远程开关检查
- [ ] gzip 批量压缩上报

### 3.6 joya_feedback_kit — 集成入口
- JoyaFeedbackKit 统一初始化入口
- 配置类：projectKey, apiBaseUrl, 功能开关
- main.dart 集成示例：runZonedGuarded + FlutterError.onError 集成

**验收标准**：
- [ ] 一行初始化启用所有反馈能力
- [ ] runZonedGuarded 捕获 Dart 异常
- [ ] FlutterError.onError 捕获框架错误
