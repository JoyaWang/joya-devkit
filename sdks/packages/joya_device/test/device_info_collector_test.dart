import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:joya_device/joya_device.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const packageInfoChannel = MethodChannel('dev.fluttercommunity.plus/package_info');
  const deviceInfoChannel = MethodChannel('dev.fluttercommunity.plus/device_info');

  setUpAll(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(packageInfoChannel, (call) async {
      if (call.method == 'getAll') {
        return {
          'appName': 'TestApp',
          'packageName': 'com.example.test',
          'version': '1.2.3',
          'buildNumber': '456',
        };
      }
      return null;
    });

    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(deviceInfoChannel, (call) async {
      if (call.method == 'getDeviceInfo') {
        return {
          'name': 'TestDevice',
          'model': 'iPhone15,2',
          'localizedModel': 'iPhone',
          'systemName': 'iOS',
          'systemVersion': '17.0',
          'isPhysicalDevice': false,
        };
      }
      return null;
    });
  });

  tearDownAll(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(packageInfoChannel, null);
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(deviceInfoChannel, null);
  });

  group('DeviceInfoCollector', () {
    test('getPackageInfo returns cached value after first call', () async {
      final info1 = await DeviceInfoCollector.getPackageInfo();
      final info2 = await DeviceInfoCollector.getPackageInfo();
      expect(info1.version, '1.2.3');
      expect(identical(info1, info2), isTrue);
    });

    test('getAppVersion returns version', () async {
      final version = await DeviceInfoCollector.getAppVersion();
      expect(version, '1.2.3');
    });

    test('getBuildNumber returns build number', () async {
      final build = await DeviceInfoCollector.getBuildNumber();
      expect(build, '456');
    });

    test('getFullVersion returns version+build', () async {
      final full = await DeviceInfoCollector.getFullVersion();
      expect(full, '1.2.3+456');
    });

    test('collect includes package info', () async {
      final info = await DeviceInfoCollector.collect();
      expect(info['appVersion'], '1.2.3');
      expect(info['buildNumber'], '456');
      expect(info['packageName'], 'com.example.test');
    });
  });
}
