import 'dart:async';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show FlutterError;
import 'package:logger/logger.dart' hide MemoryOutput;
import 'package:joya_logger/joya_logger.dart';
import 'outputs/error_reporting_output.dart';
import 'services/crash_reporter_service.dart';
import 'services/error_reporter_service.dart';

/// Configuration for [JoyaFeedbackKit].
class JoyaFeedbackKitConfig {
  /// Project identifier used for grouping feedback.
  final String projectKey;

  /// Base URL of the feedback API.
  final String apiBaseUrl;

  /// Prefix for SharedPreferences keys.
  final String keyPrefix;

  /// Whether to enable crash reporting.
  final bool enableCrashReporting;

  /// Whether to enable error reporting.
  final bool enableErrorReporting;

  /// Optional custom ignore patterns for error reporting.
  final List<String>? errorIgnorePatterns;

  /// Optional custom self-ignore patterns for error reporting.
  final List<String>? errorSelfIgnorePatterns;

  const JoyaFeedbackKitConfig({
    required this.projectKey,
    required this.apiBaseUrl,
    this.keyPrefix = '',
    this.enableCrashReporting = true,
    this.enableErrorReporting = true,
    this.errorIgnorePatterns,
    this.errorSelfIgnorePatterns,
  });
}

/// Unified integration entry for Joya feedback capabilities.
///
/// Call [init] in `main()` to enable crash capture and error logging.
class JoyaFeedbackKit {
  JoyaFeedbackKit._();

  static CrashReporterService? _crashReporterService;
  static ErrorReporterService? _errorReporterService;
  static ErrorReportingOutput? _errorReportingOutput;
  static Logger? _logger;

  /// The configured crash reporter service.
  static CrashReporterService? get crashReporterService => _crashReporterService;

  /// The configured error reporter service.
  static ErrorReporterService? get errorReporterService => _errorReporterService;

  /// The error reporting output suitable for passing to [Logger].
  static ErrorReportingOutput? get errorReportingOutput => _errorReportingOutput;

  /// The default logger created by [init] when no external logger is supplied.
  static Logger? get logger => _logger;

  /// Initializes feedback services and optionally wraps the app in a guarded zone.
  ///
  /// When [logger] is omitted and [JoyaFeedbackKitConfig.enableErrorReporting]
  /// is `true`, a default [Logger] containing [errorReportingOutput] is created
  /// and exposed via [JoyaFeedbackKit.logger].
  static void init({
    required JoyaFeedbackKitConfig config,
    required void Function() appRunner,
    Dio? dio,
    Logger? logger,
    MemoryOutput? memoryLogOutput,
    FileRotationOutput? fileLogOutput,
    List<LogOutput>? extraOutputs,
  }) {
    final baseDio = dio ?? Dio();

    if (config.enableCrashReporting) {
      _crashReporterService = CrashReporterService(
        dio: baseDio,
        baseUrl: config.apiBaseUrl,
        keyPrefix: config.keyPrefix,
        memoryLogOutput: memoryLogOutput,
        fileLogOutput: fileLogOutput,
      );
    }

    if (config.enableErrorReporting) {
      _errorReporterService = ErrorReporterService(
        dio: baseDio,
        baseUrl: config.apiBaseUrl,
      );
      _errorReportingOutput = ErrorReportingOutput(
        ignorePatterns: config.errorIgnorePatterns,
        selfIgnorePatterns: config.errorSelfIgnorePatterns,
      )..initialize(reporterService: _errorReporterService!);
    }

    if (logger == null) {
      final outputs = <LogOutput>[
        if (config.enableErrorReporting && _errorReportingOutput != null)
          _errorReportingOutput!,
        ...?extraOutputs,
      ];
      _logger = Logger(
        output: outputs.isEmpty
            ? null
            : (outputs.length == 1 ? outputs.first : MultiOutput(outputs)),
        printer: PrettyPrinter(methodCount: 2),
      );
    } else {
      _logger = logger;
    }

    if (config.enableCrashReporting && _crashReporterService != null) {
      final originalOnError = FlutterError.onError;
      FlutterError.onError = (details) {
        _crashReporterService?.reportCrash(
          error: details.exception,
          stackTrace: details.stack ?? StackTrace.empty,
          source: 'FlutterError',
        );
        originalOnError?.call(details);
      };

      runZonedGuarded(
        appRunner,
        (error, stack) {
          _crashReporterService?.reportCrash(
            error: error,
            stackTrace: stack,
            source: 'ZonedError',
          );
        },
      );

      Future.microtask(() {
        _crashReporterService?.checkAndReportPendingCrash();
      });
    } else {
      appRunner();
    }
  }

  /// Sets user info callbacks for both crash and error reporters.
  static void setUserInfo({
    String? Function()? userId,
    String? Function()? username,
  }) {
    _crashReporterService?.setUserInfoCallbacks(
      getUserId: userId,
      getUsername: username,
    );
    _errorReportingOutput?.setUserInfoCallbacks(
      getUserId: userId,
      getUsername: username,
    );
  }

  /// Sets the current route provider for both crash and error reporters.
  static void setCurrentRouteProvider(String? Function()? provider) {
    _crashReporterService?.setCurrentRouteProvider(provider);
    _errorReportingOutput?.setCurrentRouteProvider(provider);
  }

  /// Disposes resources and clears internal references.
  static void dispose() {
    _errorReportingOutput?.dispose();
    _errorReportingOutput = null;
    _errorReporterService = null;
    _crashReporterService = null;
    _logger = null;
  }
}
