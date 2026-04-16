import 'app_version_response.dart';

/// App version info domain model.
class AppVersionInfo {
  final String platform;
  final String channel;
  final String latestVersion;
  final String? minSupportedVersion;
  final String? downloadUrl;
  final String? releaseNotes;
  final bool forceUpdate;
  final bool shouldPrompt;
  final int rolloutPercent;
  final String? buildNumber;
  final String? forceUpdateReason;

  const AppVersionInfo({
    required this.platform,
    required this.channel,
    required this.latestVersion,
    this.minSupportedVersion,
    this.downloadUrl,
    this.releaseNotes,
    required this.forceUpdate,
    required this.shouldPrompt,
    required this.rolloutPercent,
    this.buildNumber,
    this.forceUpdateReason,
  });

  factory AppVersionInfo.fromResponse(AppVersionResponse response) =>
      AppVersionInfo(
        platform: response.platform,
        channel: response.channel,
        latestVersion: response.latestVersion,
        minSupportedVersion: response.minSupportedVersion,
        downloadUrl: response.downloadUrl,
        releaseNotes: response.releaseNotes,
        forceUpdate: response.forceUpdate,
        shouldPrompt: response.shouldPrompt,
        rolloutPercent: response.rolloutPercent ?? 100,
        buildNumber: response.buildNumber,
        forceUpdateReason: response.forceUpdateReason,
      );

  AppVersionInfo copyWith({
    String? platform,
    String? channel,
    String? latestVersion,
    String? minSupportedVersion,
    String? downloadUrl,
    String? releaseNotes,
    bool? forceUpdate,
    bool? shouldPrompt,
    int? rolloutPercent,
    String? buildNumber,
    String? forceUpdateReason,
  }) {
    return AppVersionInfo(
      platform: platform ?? this.platform,
      channel: channel ?? this.channel,
      latestVersion: latestVersion ?? this.latestVersion,
      minSupportedVersion: minSupportedVersion ?? this.minSupportedVersion,
      downloadUrl: downloadUrl ?? this.downloadUrl,
      releaseNotes: releaseNotes ?? this.releaseNotes,
      forceUpdate: forceUpdate ?? this.forceUpdate,
      shouldPrompt: shouldPrompt ?? this.shouldPrompt,
      rolloutPercent: rolloutPercent ?? this.rolloutPercent,
      buildNumber: buildNumber ?? this.buildNumber,
      forceUpdateReason: forceUpdateReason ?? this.forceUpdateReason,
    );
  }
}
