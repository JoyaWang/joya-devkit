import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';
import 'package:joya_result/joya_result.dart';
import 'models/app_version_info.dart';
import 'version_api_client.dart';

/// Repository for version checking.
class VersionRepository {
  static const _ignoredVersionKey = 'joya_app_ignored_version';
  static const _deviceSeedKey = 'joya_app_device_seed';

  final VersionApiClient _client;
  final Future<SharedPreferences> Function() _prefsFactory;

  VersionRepository({
    required VersionApiClient client,
    Future<SharedPreferences> Function()? prefsFactory,
  })  : _client = client,
        _prefsFactory = prefsFactory ?? SharedPreferences.getInstance;

  Future<Result<AppVersionInfo>> checkVersion({
    required String platform,
    required String currentVersion,
    required String channel,
  }) async {
    try {
      final deviceId = await _resolveDeviceId();
      final response = await _client.checkAppVersion(
        platform: platform,
        currentVersion: currentVersion,
        channel: channel,
        deviceId: deviceId,
      );

      final payload = response.data;
      if (response.success && payload != null) {
        return Result.success(AppVersionInfo.fromResponse(payload));
      }
      return Result.failure(response.message);
    } catch (error) {
      return Result.failure(error.toString());
    }
  }

  Future<void> ignoreVersion(String version) async {
    final prefs = await _prefsFactory();
    await prefs.setString(_ignoredVersionKey, version);
  }

  Future<String?> loadIgnoredVersion() async {
    final prefs = await _prefsFactory();
    return prefs.getString(_ignoredVersionKey);
  }

  Future<String> _resolveDeviceId() async {
    final prefs = await _prefsFactory();
    final existing = prefs.getString(_deviceSeedKey);
    if (existing != null && existing.isNotEmpty) {
      return existing;
    }

    final deviceId = const Uuid().v4();
    await prefs.setString(_deviceSeedKey, deviceId);
    return deviceId;
  }
}
