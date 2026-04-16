import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:joya_device/joya_device.dart';
import 'package:joya_logger/joya_logger.dart';
import 'package:logger/logger.dart' show Logger;
import '../models/crash_info.dart';

/// Crash report result.
class CrashReportResult {
  final bool success;
  final String? crashId;
  final String? errorMessage;

  CrashReportResult({
    required this.success,
    this.crashId,
    this.errorMessage,
  });

  @override
  String toString() {
    if (success) {
      return 'CrashReportResult(success, crashId: $crashId)';
    }
    return 'CrashReportResult(failed: $errorMessage)';
  }
}

/// Crash reporter service.
///
/// Responsibilities:
/// 1. Capture crash info and persist it.
/// 2. Try immediate reporting.
/// 3. Retry pending crashes on next startup.
/// 4. Provide deduplication (8s window).
class CrashReporterService {
  static const Duration _reportDedupeWindow = Duration(seconds: 8);
  static const int _maxRecentSignatures = 50;

  final Dio _dio;
  final Logger? _logger;
  final String _baseUrl;
  final String _keyPrefix;
  final MemoryOutput? _memoryLogOutput;
  final FileRotationOutput? _fileLogOutput;

  String? Function()? _getUserId;
  String? Function()? _getUsername;
  String? Function()? _getCurrentRoute;

  final Map<String, DateTime> _recentCrashSignatures = {};
  bool _isReporting = false;

  CrashReporterService({
    required Dio dio,
    required String baseUrl,
    Logger? logger,
    String keyPrefix = '',
    MemoryOutput? memoryLogOutput,
    FileRotationOutput? fileLogOutput,
  })  : _dio = dio,
        _logger = logger,
        _baseUrl = baseUrl,
        _keyPrefix = keyPrefix,
        _memoryLogOutput = memoryLogOutput,
        _fileLogOutput = fileLogOutput;

  String get _pendingCrashKey => '${_keyPrefix}pending_crash_info';
  String get _crashReportedKey => '${_keyPrefix}last_crash_reported';

  void setUserInfoCallbacks({
    String? Function()? getUserId,
    String? Function()? getUsername,
  }) {
    _getUserId = getUserId;
    _getUsername = getUsername;
  }

  void setCurrentRouteProvider(String? Function()? provider) {
    _getCurrentRoute = provider;
  }

  String _buildCrashSignature({
    required Object error,
    required StackTrace stackTrace,
    required String source,
  }) {
    final stackLines = stackTrace.toString().split('\n');
    final stackHead = stackLines.isNotEmpty ? stackLines.first.trim() : '';
    return '$source|${error.runtimeType}|${error.toString()}|$stackHead';
  }

  bool _shouldSkipReport(String signature) {
    final now = DateTime.now();
    final lastReported = _recentCrashSignatures[signature];
    if (lastReported != null &&
        now.difference(lastReported) < _reportDedupeWindow) {
      return true;
    }
    _recentCrashSignatures[signature] = now;
    if (_recentCrashSignatures.length > _maxRecentSignatures) {
      final expiredAt = now.subtract(_reportDedupeWindow);
      _recentCrashSignatures
          .removeWhere((_, reportTime) => reportTime.isBefore(expiredAt));
      if (_recentCrashSignatures.length > _maxRecentSignatures) {
        final oldestEntry = _recentCrashSignatures.entries
            .reduce((a, b) => a.value.isBefore(b.value) ? a : b);
        _recentCrashSignatures.remove(oldestEntry.key);
      }
    }
    return false;
  }

  /// Records a crash and attempts to report it immediately.
  Future<void> reportCrash({
    required Object error,
    required StackTrace stackTrace,
    required String source,
  }) async {
    final signature = _buildCrashSignature(
      error: error,
      stackTrace: stackTrace,
      source: source,
    );
    if (_shouldSkipReport(signature)) {
      _logger?.w('[CrashReporter] Skip duplicate crash report');
      return;
    }
    if (_isReporting) {
      _logger?.w('[CrashReporter] Already reporting, skip');
      return;
    }
    _isReporting = true;

    try {
      _logger?.e('[CrashReporter] Crash detected ($source)',
          error: error, stackTrace: stackTrace);

      final crashInfo = await _collectCrashInfo(
        error: error,
        stackTrace: stackTrace,
        source: source,
      );

      await _persistCrashInfo(crashInfo);
      _logger?.i('[CrashReporter] Crash info persisted');

      final result = await _uploadCrash(crashInfo);
      if (result.success) {
        _logger?.i('[CrashReporter] Crash reported: ${result.crashId}');
        await _clearPendingCrash();
      } else {
        _logger?.w('[CrashReporter] Immediate report failed: ${result.errorMessage}');
      }
    } catch (e, st) {
      _logger?.e('[CrashReporter] Report process error', error: e, stackTrace: st);
    } finally {
      _isReporting = false;
    }
  }

  /// Checks whether a pending crash exists.
  Future<CrashInfo?> checkPendingCrash() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final crashJson = prefs.getString(_pendingCrashKey);
      if (crashJson != null && crashJson.isNotEmpty) {
        _logger?.i('[CrashReporter] Pending crash found');
        return CrashInfo.fromJsonString(crashJson);
      }
    } catch (e) {
      _logger?.e('[CrashReporter] checkPendingCrash failed', error: e);
    }
    return null;
  }

  /// Retries pending crash report on startup.
  Future<CrashReportResult?> checkAndReportPendingCrash() async {
    try {
      final pendingCrash = await checkPendingCrash();
      if (pendingCrash == null) {
        _logger?.d('[CrashReporter] No pending crash');
        return null;
      }

      _logger?.i('[CrashReporter] Reporting pending crash...');
      final result = await _uploadCrash(pendingCrash);

      if (result.success) {
        _logger?.i('[CrashReporter] Pending crash reported: ${result.crashId}');
        await _clearPendingCrash();
        return result;
      } else {
        _logger?.w('[CrashReporter] Pending crash report failed: ${result.errorMessage}');
        return result;
      }
    } catch (e) {
      _logger?.e('[CrashReporter] checkAndReportPendingCrash failed', error: e);
      return CrashReportResult(success: false, errorMessage: e.toString());
    }
  }

  /// Manually clears pending crash.
  Future<void> clearPendingCrash() async {
    await _clearPendingCrash();
  }

  Future<void> _clearPendingCrash() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.remove(_pendingCrashKey);
      await prefs.setString(
          _crashReportedKey, DateTime.now().toIso8601String());
      _logger?.d('[CrashReporter] Pending crash cleared');
    } catch (e) {
      _logger?.e('[CrashReporter] Clear pending crash failed', error: e);
    }
  }

  Future<CrashInfo> _collectCrashInfo({
    required Object error,
    required StackTrace stackTrace,
    required String source,
  }) async {
    Map<String, dynamic> deviceInfo = {};
    try {
      deviceInfo = await DeviceInfoCollector.collect();
    } catch (e) {
      _logger?.w('[CrashReporter] Collect device info failed: $e');
    }

    String logs = '';
    try {
      logs = _memoryLogOutput?.logsText ?? '';
      if (logs.length < 1000 && _fileLogOutput != null) {
        final now = DateTime.now();
        final fileLogs = await _fileLogOutput.getLogsForRange(
          start: now.subtract(const Duration(minutes: 10)),
          end: now,
        );
        if (fileLogs.isNotEmpty) {
          logs = '=== FILE LOGS ===\n$fileLogs\n\n=== MEMORY LOGS ===\n$logs';
        }
      }
    } catch (e) {
      _logger?.w('[CrashReporter] Collect logs failed: $e');
    }

    String? appVersion;
    String? buildNumber;
    try {
      appVersion = await DeviceInfoCollector.getAppVersion();
      buildNumber = await DeviceInfoCollector.getBuildNumber();
    } catch (e) {
      _logger?.w('[CrashReporter] Get version failed: $e');
    }

    return CrashInfo(
      errorMessage: error.toString(),
      errorType: error.runtimeType.toString(),
      stackTrace: stackTrace.toString(),
      source: source,
      timestamp: DateTime.now(),
      logs: logs,
      deviceInfo: deviceInfo,
      userId: _getUserId?.call(),
      username: _getUsername?.call(),
      currentRoute: _getCurrentRoute?.call(),
      appVersion: appVersion,
      buildNumber: buildNumber,
    );
  }

  Future<void> _persistCrashInfo(CrashInfo crashInfo) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_pendingCrashKey, crashInfo.toJsonString());
    } catch (e) {
      _logger?.e('[CrashReporter] Persist crash info failed', error: e);
      rethrow;
    }
  }

  Future<CrashReportResult> _uploadCrash(CrashInfo crashInfo) async {
    try {
      _logger?.i('[CrashReporter] Uploading crash...');

      final payload = {
        'errorMessage': crashInfo.errorMessage,
        'errorType': crashInfo.errorType,
        'stackTrace': crashInfo.stackTrace,
        'source': crashInfo.source,
        'timestamp': crashInfo.timestamp.toIso8601String(),
        'logs': crashInfo.logs,
        'deviceInfo': crashInfo.deviceInfo,
        'userId': crashInfo.userId,
        'username': crashInfo.username,
        'currentRoute': crashInfo.currentRoute,
        'appVersion': crashInfo.appVersion,
        'buildNumber': crashInfo.buildNumber,
      };

      final jsonString = jsonEncode(payload);
      final utf8Bytes = utf8.encode(jsonString);
      final gzipCompressed = gzip.encode(utf8Bytes);

      _logger?.d(
          '[CrashReporter] Raw: ${utf8Bytes.length}, Compressed: ${gzipCompressed.length}');

      final response = await _dio.post(
        '$_baseUrl/feedback/submit-crash',
        data: gzipCompressed,
        options: Options(
          extra: {'skipAuth': true},
          headers: {
            'Content-Encoding': 'gzip',
            'Content-Type': 'application/octet-stream',
          },
          sendTimeout: const Duration(seconds: 30),
          receiveTimeout: const Duration(seconds: 30),
        ),
      );

      var responseData = response.data;
      if (responseData is String) {
        responseData = jsonDecode(responseData);
      }

      if (responseData['success'] == true) {
        return CrashReportResult(
          success: true,
          crashId: responseData['crashId'] as String?,
        );
      } else {
        return CrashReportResult(
          success: false,
          errorMessage: responseData['error'] as String? ?? 'Unknown error',
        );
      }
    } on DioException catch (e) {
      _logger?.e('[CrashReporter] Network error', error: e);
      return CrashReportResult(
        success: false,
        errorMessage: 'Network error: ${e.message}',
      );
    } catch (e) {
      _logger?.e('[CrashReporter] Upload failed', error: e);
      return CrashReportResult(
        success: false,
        errorMessage: e.toString(),
      );
    }
  }
}
