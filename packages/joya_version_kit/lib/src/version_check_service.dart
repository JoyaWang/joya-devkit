import 'package:joya_result/joya_result.dart';
import 'models/app_version_info.dart';
import 'version_repository.dart';

/// Normalized version for comparison.
class NormalizedVersion {
  final int major;
  final int minor;
  final int patch;
  final int? build;
  final String raw;

  const NormalizedVersion({
    required this.major,
    required this.minor,
    required this.patch,
    this.build,
    required this.raw,
  });
}

/// Result of a version check.
class VersionCheckResult {
  final AppVersionInfo info;
  final bool shouldShow;

  const VersionCheckResult({
    required this.info,
    required this.shouldShow,
  });
}

/// Service for checking app updates and evaluating prompts.
class VersionCheckService {
  final VersionRepository _repository;

  VersionCheckService({required VersionRepository repository})
      : _repository = repository;

  /// Checks version from the backend and decides whether to show the update prompt.
  Future<Result<VersionCheckResult>> check({
    required String platform,
    required String currentVersion,
    required String channel,
  }) async {
    final result = await _repository.checkVersion(
      platform: platform,
      currentVersion: currentVersion,
      channel: channel,
    );

    if (result.isSuccess) {
      final info = result.getOrThrow();
      final ignoredVersion = await _repository.loadIgnoredVersion();
      final shouldShow = shouldPromptUpdate(
        info: info,
        currentVersion: currentVersion,
        ignoredVersion: ignoredVersion,
      );
      return Result.success(VersionCheckResult(info: info, shouldShow: shouldShow));
    }

    return Result.failure(result.error ?? 'Unknown error');
  }

  /// Determines whether the update prompt should be shown based on local logic.
  bool shouldPromptUpdate({
    required AppVersionInfo info,
    required String currentVersion,
    String? ignoredVersion,
  }) {
    final current = normalizeVersion(currentVersion);
    final latest = normalizeVersion(info.latestVersion);

    // If we cannot parse versions, fall back to server decision
    if (current == null || latest == null) {
      return info.shouldPrompt;
    }

    // Already up-to-date or newer
    if (compareVersions(current, latest) >= 0) {
      return false;
    }

    // Force update always shows
    if (info.forceUpdate) {
      return true;
    }

    // User explicitly ignored this version
    if (ignoredVersion != null && ignoredVersion == info.latestVersion) {
      return false;
    }

    return info.shouldPrompt;
  }

  /// Maps a device seed to a bucket in [0, 99] using the same algorithm as the backend.
  static int hashToBucket(String seed) {
    var hash = 0;
    for (var i = 0; i < seed.length; i++) {
      hash = ((hash * 31 + seed.codeUnitAt(i)) & 0xFFFFFFFF) % 100;
    }
    return hash;
  }

  /// Checks whether the device falls into the rollout range.
  static bool isInRollout(String deviceId, int rolloutPercent) {
    if (rolloutPercent >= 100) return true;
    if (rolloutPercent <= 0) return false;
    return hashToBucket(deviceId) < rolloutPercent;
  }

  /// Parses a version string into [NormalizedVersion].
  /// Supports optional 'v' prefix and optional '+build' suffix.
  static NormalizedVersion? normalizeVersion(String? version) {
    if (version == null || version.trim().isEmpty) return null;
    final cleaned = version.trim().replaceFirst(
      RegExp(r'^v', caseSensitive: false),
      '',
    );
    if (cleaned.isEmpty) return null;

    final parts = cleaned.split('+');
    final mainPart = parts[0];
    final buildPart = parts.length > 1 ? parts[1] : null;

    if (!RegExp(r'^\d+(\.\d+)*$').hasMatch(mainPart)) return null;

    final versionParts = mainPart
        .split('.')
        .map((v) => int.tryParse(v) ?? 0)
        .toList();
    while (versionParts.length < 3) {
      versionParts.add(0);
    }

    return NormalizedVersion(
      major: versionParts[0],
      minor: versionParts[1],
      patch: versionParts[2],
      build: buildPart != null ? int.tryParse(buildPart) ?? 0 : null,
      raw: cleaned,
    );
  }

  /// Compares two normalized versions.
  /// Returns negative if [a] < [b], zero if equal, positive if [a] > [b].
  static int compareVersions(NormalizedVersion? a, NormalizedVersion? b) {
    if (a == null || b == null) return 0;
    if (a.major != b.major) return a.major.compareTo(b.major);
    if (a.minor != b.minor) return a.minor.compareTo(b.minor);
    if (a.patch != b.patch) return a.patch.compareTo(b.patch);
    if (a.build != null && b.build != null && a.build != b.build) {
      return a.build!.compareTo(b.build!);
    }
    return 0;
  }
}
