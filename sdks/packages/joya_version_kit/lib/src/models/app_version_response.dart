/// App version response from backend.
class AppVersionResponse {
  final String platform;
  final String channel;
  final String latestVersion;
  final String? minSupportedVersion;
  final String? downloadUrl;
  final String? releaseNotes;
  final bool forceUpdate;
  final bool shouldPrompt;
  final int? rolloutPercent;
  final String? buildNumber;
  final String? forceUpdateReason;

  const AppVersionResponse({
    required this.platform,
    required this.channel,
    required this.latestVersion,
    this.minSupportedVersion,
    this.downloadUrl,
    this.releaseNotes,
    required this.forceUpdate,
    required this.shouldPrompt,
    this.rolloutPercent,
    this.buildNumber,
    this.forceUpdateReason,
  });

  factory AppVersionResponse.fromJson(Map<String, dynamic> json) {
    return AppVersionResponse(
      platform: json['platform'] as String? ?? '',
      channel: json['channel'] as String? ?? '',
      latestVersion: json['latest_version'] as String? ?? json['latestVersion'] as String? ?? '',
      minSupportedVersion: json['min_supported_version'] as String? ?? json['minSupportedVersion'] as String?,
      downloadUrl: json['download_url'] as String? ?? json['downloadUrl'] as String?,
      releaseNotes: json['release_notes'] as String? ?? json['releaseNotes'] as String?,
      forceUpdate: json['force_update'] as bool? ?? json['forceUpdate'] as bool? ?? false,
      shouldPrompt: json['should_prompt'] as bool? ?? json['shouldPrompt'] as bool? ?? false,
      rolloutPercent: json['rollout_percent'] as int? ?? json['rolloutPercent'] as int?,
      buildNumber: json['build_number'] as String? ?? json['buildNumber'] as String?,
      forceUpdateReason: json['force_update_reason'] as String? ?? json['forceUpdateReason'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'platform': platform,
        'channel': channel,
        'latest_version': latestVersion,
        'min_supported_version': minSupportedVersion,
        'download_url': downloadUrl,
        'release_notes': releaseNotes,
        'force_update': forceUpdate,
        'should_prompt': shouldPrompt,
        'rollout_percent': rolloutPercent,
        'build_number': buildNumber,
        'force_update_reason': forceUpdateReason,
      };
}
