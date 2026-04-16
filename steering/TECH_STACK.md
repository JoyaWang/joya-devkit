# TECH_STACK: joya-flutter-kits

## 技术栈

### 语言与框架
- **Dart 3.x**（Flutter SDK ≥3.22.0）
- **Flutter**（仅用于平台通道，包本身不依赖 Flutter UI 框架的尽量做成 pure Dart）

### 包管理
- **melos**：monorepo 多包管理（统一版本、依赖分析、批量发布）
- **pub workspace**：Dart 3.x 原生 workspace 支持

### 核心依赖

| 包 | 用途 | 使用者 |
|----|------|--------|
| `dio` | HTTP 客户端 | joya_http, joya_version_kit, joya_feedback_kit |
| `flutter_secure_storage` | 安全 Token 存储 | joya_auth |
| `logger` | 日志框架（LogOutput 扩展点） | joya_logger |
| `path_provider` | 文件路径获取 | joya_logger |
| `device_info_plus` | 设备信息采集 | joya_device |
| `package_info_plus` | 应用版本信息 | joya_device, joya_version_kit |
| `intl` | 日期格式化 | joya_logger |
| `json_annotation` | JSON 序列化注解 | joya_version_kit, joya_feedback_kit |
| `uuid` | UUID 生成（设备 ID） | joya_version_kit |
| `shared_preferences` | 轻量 KV 存储 | joya_version_kit, joya_feedback_kit |

### 开发依赖

| 包 | 用途 |
|----|------|
| `flutter_test` | 单元测试 |
| `mocktail` | Mock 框架 |
| `build_runner` | 代码生成 |
| `json_serializable` | JSON 序列化代码生成 |

### Monorepo 结构

```
joya-flutter-kits/
├── melos.yaml
├── pubspec.yaml              # workspace 根
├── packages/
│   ├── joya_result/          # P0
│   ├── joya_auth/            # P0
│   ├── joya_http/            # P0
│   ├── joya_logger/          # P2
│   ├── joya_device/          # P2
│   ├── joya_version_kit/     # P1
│   └── joya_feedback_kit/    # P2
├── steering/
├── .agent/
└── progress.md
```

### 依赖关系图

```
joya_result          (零依赖)
joya_auth            (依赖: flutter_secure_storage)
joya_http            (依赖: dio, joya_auth, joya_result)
joya_device          (依赖: device_info_plus, package_info_plus)
joya_logger          (依赖: logger, path_provider, intl)
joya_version_kit     (依赖: joya_http, joya_device, shared_preferences, uuid)
joya_feedback_kit    (依赖: joya_http, joya_logger, joya_device, shared_preferences)
```
