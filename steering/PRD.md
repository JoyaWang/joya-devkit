# PRD: joya-flutter-kits

## 项目定位

Joya Flutter 公共能力包集合。从 Laicai 项目提取经过生产验证的基础设施能力，做成独立 Flutter package，供 InfoV 及未来所有 Joya 移动应用复用。

## 核心目标

1. **零业务耦合**：每个包只解决一个通用技术问题，不包含任何项目特定逻辑
2. **最小配置接入**：项目 3-5 行代码即可启用一项能力
3. **独立版本管理**：每个包可独立发版，项目按需引入
4. **生产级质量**：从 Laicai 提取的代码已在线上运行，保持同等质量标准

## 包清单（P0-P2）

### P0：基础设施层

| 包名 | 职责 | 来源 |
|------|------|------|
| `joya_result` | Result<T> 函数式错误处理（success/failure + fold + getOrThrow） | Laicai `domain/result.dart` |
| `joya_auth` | Token 安全存储（FlutterSecureStorage + 内存缓存 + JWT 解码 + onAuthError 流） | Laicai `TokenService` |
| `joya_http` | Dio 工厂 + Auth 拦截器（token 注入 + soft401 + 自动刷新）+ ApiResponse 包装 | Laicai `AuthInterceptor` + `api_endpoints.dart` |

### P1：版本更新

| 包名 | 职责 | 来源 |
|------|------|------|
| `joya_version_kit` | 版本检查 API + 灰度判断 + 更新弹窗 UI（可 override）+ APK 下载安装 / App Store 跳转 | Laicai 版本更新全链路 |

### P2：反馈上报

| 包名 | 职责 | 来源 |
|------|------|------|
| `joya_logger` | 文件按小时轮转 + 内存环形缓冲 + 日志清洗/sanitize + LogCleanupService | Laicai 日志系统 |
| `joya_device` | 设备信息采集（Android/iOS 全量）+ PackageInfo 缓存 | Laicai `DeviceInfoCollector` |
| `joya_feedback_kit` | 崩溃捕获→持久化→压缩上报 + 错误去重限流批量上报 + 手动反馈 UI | Laicai `CrashReporterService` + `ErrorReporterService` + `FeedbackBottomSheet` |

## 非目标（P3 及以后）

- `joya_media`：图片压缩 + ZIP + 上传
- `joya_cache`：泛型 EntityStore + TTL
- `joya_events`：类型安全事件总线
- `joya_platform`：CPU 架构检测 + 中文数字格式化
- Laicai / InfoV 接入（跑稳后再切）
- SRS 后端 feedback-service（先只做 Flutter 客户端侧，后端上报 API 暂时直连各项目自有后端）

## 验收标准

### 通用

- [ ] 每个包有独立的 `README.md` 和 `example/`
- [ ] 每个包通过 `flutter analyze` 零 warning
- [ ] 每个包有单元测试覆盖核心逻辑
- [ ] 包之间依赖关系清晰，无循环依赖

### P0

- [ ] `joya_result`：Result.success/failure 构造、fold、getOrThrow 工作正常
- [ ] `joya_auth`：Token 安全存储 + 内存缓存 + restoreCache + forceLogout 流工作正常
- [ ] `joya_http`：Dio 实例创建 + Auth 拦截器注入 token + soft401 检测 + token 自动刷新重试

### P1

- [ ] `joya_version_kit`：版本检查 API 调用 + 灰度判断（hashToBucket）+ 更新弹窗展示 + APK 下载进度

### P2

- [ ] `joya_logger`：文件按小时轮转写入 + 保留期清理 + 内存缓冲读取 + 日志清洗
- [ ] `joya_device`：Android/iOS 设备信息采集 + 版本号缓存
- [ ] `joya_feedback_kit`：崩溃捕获持久化上报 + 错误去重限流批量上报 + 远程开关
