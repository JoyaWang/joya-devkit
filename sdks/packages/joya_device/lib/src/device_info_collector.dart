import 'dart:io';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:package_info_plus/package_info_plus.dart';

/// Device info collector utility.
///
/// Provides unified device information for crash reporting and feedback.
class DeviceInfoCollector {
  static final DeviceInfoPlugin _deviceInfoPlugin = DeviceInfoPlugin();
  static PackageInfo? _cachedPackageInfo;

  /// Collects complete device information.
  static Future<Map<String, dynamic>> collect() async {
    final packageInfo = await getPackageInfo();

    final Map<String, dynamic> deviceInfo = {
      'appVersion': packageInfo.version,
      'buildNumber': packageInfo.buildNumber,
      'packageName': packageInfo.packageName,
    };

    if (Platform.isAndroid) {
      final androidInfo = await _deviceInfoPlugin.androidInfo;
      deviceInfo.addAll({
        'platform': 'Android',
        'model': androidInfo.model,
        'os': 'Android',
        'osVersion': androidInfo.version.release,
        'sdkInt': androidInfo.version.sdkInt,
        'manufacturer': androidInfo.manufacturer,
        'brand': androidInfo.brand,
        'device': androidInfo.device,
        'product': androidInfo.product,
        'isPhysicalDevice': androidInfo.isPhysicalDevice,
      });
    } else if (Platform.isIOS) {
      final iosInfo = await _deviceInfoPlugin.iosInfo;
      deviceInfo.addAll({
        'platform': 'iOS',
        'model': iosInfo.model,
        'os': 'iOS',
        'osVersion': iosInfo.systemVersion,
        'name': iosInfo.name,
        'localizedModel': iosInfo.localizedModel,
        'isPhysicalDevice': iosInfo.isPhysicalDevice,
      });
    }

    return deviceInfo;
  }

  /// Gets PackageInfo with caching.
  static Future<PackageInfo> getPackageInfo() async {
    _cachedPackageInfo ??= await PackageInfo.fromPlatform();
    return _cachedPackageInfo!;
  }

  /// Gets app version.
  static Future<String> getAppVersion() async {
    final packageInfo = await getPackageInfo();
    return packageInfo.version;
  }

  /// Gets build number.
  static Future<String> getBuildNumber() async {
    final packageInfo = await getPackageInfo();
    return packageInfo.buildNumber;
  }

  /// Gets full version string.
  static Future<String> getFullVersion() async {
    final packageInfo = await getPackageInfo();
    return '${packageInfo.version}+${packageInfo.buildNumber}';
  }
}
