import 'dart:convert';

/// Crash information model.
///
/// Persisted across app restarts for retry reporting.
class CrashInfo {
  final String errorMessage;
  final String errorType;
  final String stackTrace;
  final String source;
  final DateTime timestamp;
  final String? logs;
  final Map<String, dynamic> deviceInfo;
  final String? userId;
  final String? username;
  final String? currentRoute;
  final String? appVersion;
  final String? buildNumber;

  CrashInfo({
    required this.errorMessage,
    required this.errorType,
    required this.stackTrace,
    required this.source,
    required this.timestamp,
    this.logs,
    required this.deviceInfo,
    this.userId,
    this.username,
    this.currentRoute,
    this.appVersion,
    this.buildNumber,
  });

  factory CrashInfo.fromJson(Map<String, dynamic> json) {
    return CrashInfo(
      errorMessage: json['errorMessage'] as String? ?? 'Unknown error',
      errorType: json['errorType'] as String? ?? 'Unknown',
      stackTrace: json['stackTrace'] as String? ?? '',
      source: json['source'] as String? ?? 'unknown',
      timestamp: json['timestamp'] != null
          ? DateTime.parse(json['timestamp'] as String)
          : DateTime.now(),
      logs: json['logs'] as String?,
      deviceInfo: (json['deviceInfo'] as Map<String, dynamic>?) ?? {},
      userId: json['userId'] as String?,
      username: json['username'] as String?,
      currentRoute: json['currentRoute'] as String?,
      appVersion: json['appVersion'] as String?,
      buildNumber: json['buildNumber'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'errorMessage': errorMessage,
      'errorType': errorType,
      'stackTrace': stackTrace,
      'source': source,
      'timestamp': timestamp.toIso8601String(),
      'logs': logs,
      'deviceInfo': deviceInfo,
      'userId': userId,
      'username': username,
      'currentRoute': currentRoute,
      'appVersion': appVersion,
      'buildNumber': buildNumber,
    };
  }

  String toJsonString() => jsonEncode(toJson());

  factory CrashInfo.fromJsonString(String jsonString) {
    return CrashInfo.fromJson(jsonDecode(jsonString) as Map<String, dynamic>);
  }

  String get title {
    final shortError = errorMessage.length > 80
        ? '${errorMessage.substring(0, 80)}...'
        : errorMessage;
    return '[$source] $errorType: $shortError';
  }

  String get description {
    final buffer = StringBuffer();
    buffer.writeln('## Crash Info');
    buffer.writeln('- **Source**: $source');
    buffer.writeln('- **Type**: $errorType');
    buffer.writeln('- **Time**: ${timestamp.toIso8601String()}');
    buffer.writeln('- **Route**: ${currentRoute ?? 'unknown'}');
    buffer.writeln('- **Version**: ${appVersion ?? 'unknown'} (${buildNumber ?? '?'})');
    buffer.writeln();
    buffer.writeln('## Message');
    buffer.writeln('```');
    buffer.writeln(errorMessage);
    buffer.writeln('```');
    buffer.writeln();
    buffer.writeln('## Stack Trace');
    buffer.writeln('```');
    buffer.writeln(stackTrace);
    buffer.writeln('```');
    return buffer.toString();
  }

  @override
  String toString() {
    return 'CrashInfo(source: $source, errorType: $errorType, '
        'timestamp: ${timestamp.toIso8601String()}, route: $currentRoute)';
  }
}
