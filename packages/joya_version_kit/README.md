# joya_version_kit

版本更新检查与 UI 套件，用于 Joya Flutter 项目。

## 功能

- 向服务端查询最新应用版本信息
- 支持强制更新、灰度发布、渠道分发
- 本地持久化忽略版本与设备标识
- 提供更新策略配置（自动下载、仅下载、手动）
- 内置下载进度模型与格式化工具

## 使用

```dart
import 'package:joya_version_kit/joya_version_kit.dart';
import 'package:dio/dio.dart';

final client = VersionApiClient(dio: Dio(BaseOptions(baseUrl: 'https://api.example.com')));
final repo = VersionRepository(client: client);

final result = await repo.checkVersion(
  platform: 'android',
  currentVersion: '1.0.0',
  channel: 'stable',
);

result.fold(
  (error) => print('检查失败: $error'),
  (info) => print('最新版本: ${info.latestVersion}, 强制更新: ${info.forceUpdate}'),
);
```

## 模型

- `AppVersionResponse` — 服务端原始响应（支持 snake_case / camelCase）
- `AppVersionInfo` — 领域模型，用于业务层消费
- `UpdateConfig` — 更新策略与行为配置
- `DownloadProgress` — 下载进度与格式化展示

## 测试

```bash
flutter test
```
