import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:logger/logger.dart' show Logger;
import '../models/error_info.dart';

/// Error report result.
class ErrorReportResult {
  final bool success;
  final int? errorsReported;
  final List<int>? issueNumbers;
  final String? errorMessage;

  ErrorReportResult({
    required this.success,
    this.errorsReported,
    this.issueNumbers,
    this.errorMessage,
  });

  @override
  String toString() {
    if (success) {
      return 'ErrorReportResult(success, reported: $errorsReported, issues: $issueNumbers)';
    }
    return 'ErrorReportResult(failed: $errorMessage)';
  }
}

/// Error reporter service.
///
/// Checks remote switch status and batches errors to the backend.
class ErrorReporterService {
  final Dio _dio;
  final Logger? _logger;
  final String _baseUrl;

  bool? _enabled;
  DateTime? _lastConfigCheck;
  static const Duration _configCacheDuration = Duration(minutes: 5);

  ErrorReporterService({
    required Dio dio,
    required String baseUrl,
    Logger? logger,
  })  : _dio = dio,
        _logger = logger,
        _baseUrl = baseUrl;

  /// Checks whether remote reporting is enabled (cached for 5 minutes).
  Future<bool> isEnabled() async {
    final now = DateTime.now();
    if (_enabled != null &&
        _lastConfigCheck != null &&
        now.difference(_lastConfigCheck!) < _configCacheDuration) {
      return _enabled!;
    }

    try {
      final response = await _dio.get(
        '$_baseUrl/feedback/client-settings',
        options: Options(
          sendTimeout: const Duration(seconds: 5),
          receiveTimeout: const Duration(seconds: 5),
        ),
      );

      var data = response.data;
      if (data is String) {
        data = jsonDecode(data);
      }

      _enabled = data['errorReportingEnabled'] ?? true;
      _lastConfigCheck = now;
      _logger?.d('[ErrorReporter] Remote switch: $_enabled');
      return _enabled!;
    } on DioException catch (e) {
      _logger?.w(
        '[ErrorReporter] Remote config failed (status=${e.response?.statusCode}), default enabled',
      );
      return true;
    } catch (e) {
      _logger?.w('[ErrorReporter] Remote config failed, default enabled: $e');
      return true;
    }
  }

  /// Reports a batch of errors.
  Future<ErrorReportResult> reportErrors(List<ErrorInfo> errors) async {
    if (errors.isEmpty) {
      return ErrorReportResult(success: true, errorsReported: 0);
    }

    try {
      final enabled = await isEnabled();
      if (!enabled) {
        _logger?.d('[ErrorReporter] Remote switch off, skip ${errors.length} errors');
        return ErrorReportResult(
          success: true,
          errorsReported: 0,
          errorMessage: 'Remote switch is off',
        );
      }
    } catch (e) {
      _logger?.w('[ErrorReporter] Switch check failed: $e');
    }

    try {
      _logger?.i('[ErrorReporter] Reporting ${errors.length} errors...');

      final payload = {
        'errors': errors.map((e) => e.toJson()).toList(),
        'reportedAt': DateTime.now().toIso8601String(),
        'count': errors.length,
      };

      final jsonString = jsonEncode(payload);
      final utf8Bytes = utf8.encode(jsonString);
      final gzipCompressed = gzip.encode(utf8Bytes);

      _logger?.d(
          '[ErrorReporter] Raw: ${utf8Bytes.length}, Compressed: ${gzipCompressed.length}');

      final response = await _dio.post(
        '$_baseUrl/feedback/submit-errors',
        data: gzipCompressed,
        options: Options(
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
        final results = responseData['results'] as List<dynamic>?;
        final issueNumbers = results
            ?.map((r) => r['issueNumber'] as int?)
            .whereType<int>()
            .toList();

        _logger?.i(
            '[ErrorReporter] Reported ${errors.length} errors, Issues: $issueNumbers');

        return ErrorReportResult(
          success: true,
          errorsReported: errors.length,
          issueNumbers: issueNumbers,
        );
      } else {
        final errorMsg = responseData['error'] as String? ?? 'Unknown error';
        _logger?.w('[ErrorReporter] Report response error: $errorMsg');
        return ErrorReportResult(
          success: false,
          errorMessage: errorMsg,
        );
      }
    } on DioException catch (e) {
      _logger?.e(
        '[ErrorReporter] Network error '
        '(status=${e.response?.statusCode}, path=${e.requestOptions.path}, '
        'response=${e.response?.data})',
        error: e,
      );
      return ErrorReportResult(
        success: false,
        errorMessage: 'Network error: ${e.message}',
      );
    } catch (e) {
      _logger?.e('[ErrorReporter] Report failed', error: e);
      return ErrorReportResult(
        success: false,
        errorMessage: e.toString(),
      );
    }
  }

  void clearConfigCache() {
    _enabled = null;
    _lastConfigCheck = null;
  }
}
