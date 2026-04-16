import 'package:flutter_test/flutter_test.dart';
import 'package:joya_http/joya_http.dart';
import 'package:joya_version_kit/src/models/app_version_response.dart';
import 'package:joya_version_kit/src/version_api_client.dart';
import 'package:joya_version_kit/src/version_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

class _MockApiClient implements VersionApiClient {
  final AppVersionResponse response;
  final Exception? exception;
  String? capturedDeviceId;

  _MockApiClient({required this.response, this.exception});

  @override
  Future<ApiResponse<AppVersionResponse>> checkAppVersion({
    required String platform,
    required String currentVersion,
    required String channel,
    required String deviceId,
  }) async {
    capturedDeviceId = deviceId;
    if (exception != null) {
      throw exception!;
    }
    return ApiResponse(
      success: true,
      message: '',
      data: response,
      code: 0,
    );
  }
}

void main() {
  const response = AppVersionResponse(
    platform: 'android',
    channel: 'stable',
    latestVersion: '2.0.0',
    minSupportedVersion: '1.0.0',
    downloadUrl: 'https://example.com/app.apk',
    releaseNotes: 'Notes',
    forceUpdate: false,
    shouldPrompt: true,
    rolloutPercent: 100,
    buildNumber: '200',
    forceUpdateReason: null,
  );

  group('VersionRepository', () {
    test('checkVersion returns success with AppVersionInfo', () async {
      SharedPreferences.setMockInitialValues({});
      final client = _MockApiClient(response: response);
      final repo = VersionRepository(
        client: client,
        prefsFactory: SharedPreferences.getInstance,
      );

      final result = await repo.checkVersion(
        platform: 'android',
        currentVersion: '1.0.0',
        channel: 'stable',
      );

      expect(result.isSuccess, isTrue);
      final info = result.getOrThrow();
      expect(info.latestVersion, '2.0.0');
      expect(info.platform, 'android');
      expect(client.capturedDeviceId, isNotNull);
      expect(client.capturedDeviceId!.isNotEmpty, isTrue);
    });

    test('checkVersion returns failure when API reports unsuccessful', () async {
      SharedPreferences.setMockInitialValues({});
      final failingClient = _FailingApiClient(message: 'server error');
      final repo = VersionRepository(
        client: failingClient,
        prefsFactory: SharedPreferences.getInstance,
      );

      final result = await repo.checkVersion(
        platform: 'android',
        currentVersion: '1.0.0',
        channel: 'stable',
      );

      expect(result.isSuccess, isFalse);
      expect(result.error, 'server error');
    });

    test('checkVersion returns failure on exception', () async {
      SharedPreferences.setMockInitialValues({});
      final client = _MockApiClient(
        response: response,
        exception: Exception('network down'),
      );
      final repo = VersionRepository(
        client: client,
        prefsFactory: SharedPreferences.getInstance,
      );

      final result = await repo.checkVersion(
        platform: 'android',
        currentVersion: '1.0.0',
        channel: 'stable',
      );

      expect(result.isSuccess, isFalse);
      expect(result.error, contains('network down'));
    });

    test('ignoreVersion and loadIgnoredVersion persist value', () async {
      SharedPreferences.setMockInitialValues({});
      final client = _MockApiClient(response: response);
      final repo = VersionRepository(
        client: client,
        prefsFactory: SharedPreferences.getInstance,
      );

      await repo.ignoreVersion('1.2.3');
      final ignored = await repo.loadIgnoredVersion();
      expect(ignored, '1.2.3');
    });

    test('reuses existing deviceId from prefs', () async {
      SharedPreferences.setMockInitialValues({
        'joya_app_device_seed': 'existing-device-id',
      });
      final client = _MockApiClient(response: response);
      final repo = VersionRepository(
        client: client,
        prefsFactory: SharedPreferences.getInstance,
      );

      await repo.checkVersion(
        platform: 'android',
        currentVersion: '1.0.0',
        channel: 'stable',
      );

      expect(client.capturedDeviceId, 'existing-device-id');
    });

    test('generates and saves new deviceId when none exists', () async {
      SharedPreferences.setMockInitialValues({});
      final client = _MockApiClient(response: response);
      final repo = VersionRepository(
        client: client,
        prefsFactory: SharedPreferences.getInstance,
      );

      await repo.checkVersion(
        platform: 'android',
        currentVersion: '1.0.0',
        channel: 'stable',
      );

      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString('joya_app_device_seed');
      expect(saved, isNotNull);
      expect(saved, client.capturedDeviceId);
    });
  });
}

class _FailingApiClient implements VersionApiClient {
  final String message;

  _FailingApiClient({required this.message});

  @override
  Future<ApiResponse<AppVersionResponse>> checkAppVersion({
    required String platform,
    required String currentVersion,
    required String channel,
    required String deviceId,
  }) async {
    return ApiResponse(
      success: false,
      message: message,
      code: 500,
    );
  }
}
