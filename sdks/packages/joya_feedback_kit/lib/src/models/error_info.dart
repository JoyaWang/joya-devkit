import 'dart:convert';

/// Error information model for automated error reporting.
class ErrorInfo {
  final String errorMessage;
  final String? errorType;
  final String? stackTrace;
  final String source;
  final DateTime timestamp;
  final String? currentRoute;
  final String? appVersion;
  final String? buildNumber;
  final String? userId;
  final String? username;
  final Map<String, dynamic>? deviceInfo;

  ErrorInfo({
    required this.errorMessage,
    this.errorType,
    this.stackTrace,
    required this.source,
    required this.timestamp,
    this.currentRoute,
    this.appVersion,
    this.buildNumber,
    this.userId,
    this.username,
    this.deviceInfo,
  });

  String get signature {
    final msgHash = errorMessage.hashCode.abs().toString();
    return '${errorType ?? 'Unknown'}:$msgHash';
  }

  String get issueTitle {
    final shortMsg = errorMessage.length > 60
        ? '${errorMessage.substring(0, 60)}...'
        : errorMessage;
    return '[$source] ${errorType ?? 'Error'}: $shortMsg';
  }

  Map<String, dynamic> toJson() {
    return {
      'errorMessage': errorMessage,
      'errorType': errorType,
      'stackTrace': stackTrace,
      'source': source,
      'timestamp': timestamp.toIso8601String(),
      'currentRoute': currentRoute,
      'appVersion': appVersion,
      'buildNumber': buildNumber,
      'userId': userId,
      'username': username,
      'deviceInfo': deviceInfo,
      'signature': signature,
    };
  }

  factory ErrorInfo.fromJson(Map<String, dynamic> json) {
    return ErrorInfo(
      errorMessage: json['errorMessage'] as String? ?? 'Unknown error',
      errorType: json['errorType'] as String?,
      stackTrace: json['stackTrace'] as String?,
      source: json['source'] as String? ?? 'Unknown',
      timestamp: json['timestamp'] != null
          ? DateTime.parse(json['timestamp'] as String)
          : DateTime.now(),
      currentRoute: json['currentRoute'] as String?,
      appVersion: json['appVersion'] as String?,
      buildNumber: json['buildNumber'] as String?,
      userId: json['userId'] as String?,
      username: json['username'] as String?,
      deviceInfo: json['deviceInfo'] as Map<String, dynamic>?,
    );
  }

  String toJsonString() => jsonEncode(toJson());

  factory ErrorInfo.fromJsonString(String jsonString) {
    return ErrorInfo.fromJson(jsonDecode(jsonString) as Map<String, dynamic>);
  }

  @override
  String toString() {
    return 'ErrorInfo(source: $source, errorType: $errorType, '
        'timestamp: ${timestamp.toIso8601String()})';
  }
}
