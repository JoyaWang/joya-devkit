# joya_device

Device and package info collection for Joya Flutter kits.

## Features

- `DeviceInfoCollector.collect()` — unified device info map for Android/iOS
- `DeviceInfoCollector.getPackageInfo()` — cached `PackageInfo`
- `DeviceInfoCollector.getAppVersion()` / `getBuildNumber()` / `getFullVersion()`

## Usage

```dart
import 'package:joya_device/joya_device.dart';

final info = await DeviceInfoCollector.collect();
// {
//   'appVersion': '1.2.3',
//   'buildNumber': '456',
//   'packageName': 'com.example.app',
//   'platform': 'Android', // or 'iOS'
//   'model': '...',
//   'osVersion': '...',
//   'isPhysicalDevice': true,
//   ...
// }

final version = await DeviceInfoCollector.getAppVersion();
final fullVersion = await DeviceInfoCollector.getFullVersion(); // 1.2.3+456
```

## Testing

```bash
flutter test
```
