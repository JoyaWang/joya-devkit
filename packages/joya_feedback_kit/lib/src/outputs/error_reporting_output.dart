import 'dart:async';
import 'package:logger/logger.dart' show Logger, Level, LogOutput, OutputEvent;
import '../models/error_info.dart';
import '../services/error_reporter_service.dart';

/// Log output that intercepts Level.error logs and reports them
/// with deduplication, rate limiting, and batching.
class ErrorReportingOutput extends LogOutput {
  static const Duration _dedupeWindow = Duration(minutes: 5);
  static const int _rateLimitPerMinute = 10;
  static const Duration _batchWindow = Duration(seconds: 5);

  String? Function()? _getUserId;
  String? Function()? _getUsername;
  String? Function()? _getCurrentRoute;

  final Map<String, DateTime> _dedupeCache = {};
  final List<DateTime> _rateLimitCounter = [];
  final List<ErrorInfo> _batchQueue = [];
  Timer? _batchTimer;

  final List<String> _ignorePatterns;
  final List<String> _selfIgnorePatterns;

  ErrorReporterService? _reporterService;
  Logger? _internalLogger;

  bool get isInitialized => _reporterService != null;

  ErrorReportingOutput({
    List<String>? ignorePatterns,
    List<String>? selfIgnorePatterns,
  })  : _ignorePatterns = ignorePatterns ?? _defaultIgnorePatterns,
        _selfIgnorePatterns = selfIgnorePatterns ?? _defaultSelfIgnorePatterns;

  static final List<String> _defaultIgnorePatterns = [
    'SocketException',
    'TimeoutException',
    'HandshakeException',
    'ConnectionClosed',
    'Connection refused',
    'Network is unreachable',
    '401',
    '403',
    'Unauthorized',
    'Forbidden',
    'cancelled',
    'Canceled',
    'DioError [cancel]',
    'Image decoding failed',
  ];

  static final List<String> _defaultSelfIgnorePatterns = [
    '[ErrorReporter]',
    '[ErrorReporting]',
    'submit-errors',
  ];

  void initialize({
    required ErrorReporterService reporterService,
    Logger? internalLogger,
  }) {
    _reporterService = reporterService;
    _internalLogger = internalLogger;
  }

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

  @override
  void output(OutputEvent event) {
    if (!isInitialized) return;
    if (event.level != Level.error) return;

    final errorInfo = _parseErrorInfo(event);
    if (errorInfo == null) return;
    if (_isSelfError(errorInfo)) return;
    if (_shouldIgnore(errorInfo)) return;
    if (_isDuplicate(errorInfo)) return;
    if (_isRateLimited()) return;

    _enqueue(errorInfo);
  }

  ErrorInfo? _parseErrorInfo(OutputEvent event) {
    if (event.lines.isEmpty) return null;

    try {
      String fullMessage = event.lines.join('\n');
      fullMessage = _stripAnsi(fullMessage);

      String source = 'Unknown';
      final moduleMatch = RegExp(r'\[([\w\s\-\.]+)\]').firstMatch(fullMessage);
      if (moduleMatch != null) {
        source = moduleMatch.group(1) ?? 'Unknown';
      }

      String? errorType;
      final errorTypeMatch =
          RegExp(r'(\w+Exception|\w+Error)').firstMatch(fullMessage);
      if (errorTypeMatch != null) {
        errorType = errorTypeMatch.group(1);
      }

      String? stackTrace;
      final stackIndex = fullMessage.indexOf('#0');
      if (stackIndex != -1) {
        stackTrace = fullMessage.substring(stackIndex);
      }

      return ErrorInfo(
        errorMessage: fullMessage,
        errorType: errorType,
        stackTrace: stackTrace,
        source: source,
        timestamp: DateTime.now(),
        currentRoute: _getCurrentRoute?.call(),
        userId: _getUserId?.call(),
        username: _getUsername?.call(),
      );
    } catch (e) {
      return null;
    }
  }

  bool _isSelfError(ErrorInfo info) {
    return _selfIgnorePatterns
        .any((pattern) => info.errorMessage.contains(pattern));
  }

  bool _shouldIgnore(ErrorInfo info) {
    return _ignorePatterns.any((pattern) =>
        info.errorMessage.contains(pattern) ||
        (info.errorType?.contains(pattern) ?? false));
  }

  bool _isDuplicate(ErrorInfo info) {
    final now = DateTime.now();
    final signature = info.signature;
    final lastTime = _dedupeCache[signature];

    if (lastTime != null && now.difference(lastTime) < _dedupeWindow) {
      return true;
    }

    _dedupeCache[signature] = now;
    _cleanupDedupeCache();
    return false;
  }

  void _cleanupDedupeCache() {
    final now = DateTime.now();
    _dedupeCache
        .removeWhere((_, lastTime) => now.difference(lastTime) > _dedupeWindow);
  }

  bool _isRateLimited() {
    final now = DateTime.now();
    final oneMinuteAgo = now.subtract(const Duration(minutes: 1));

    _rateLimitCounter.removeWhere((t) => t.isBefore(oneMinuteAgo));

    if (_rateLimitCounter.length >= _rateLimitPerMinute) {
      return true;
    }

    _rateLimitCounter.add(now);
    return false;
  }

  void _enqueue(ErrorInfo info) {
    _batchQueue.add(info);
    _batchTimer ??= Timer(_batchWindow, _flushBatch);
  }

  void _flushBatch() {
    _batchTimer = null;
    if (_batchQueue.isEmpty) return;

    final errors = List<ErrorInfo>.from(_batchQueue);
    _batchQueue.clear();
    _reportErrors(errors);
  }

  Future<void> _reportErrors(List<ErrorInfo> errors) async {
    try {
      await _reporterService?.reportErrors(errors);
    } catch (e) {
      _internalLogger?.w('[ErrorReportingOutput] Report failed: $e');
    }
  }

  void dispose() {
    _batchTimer?.cancel();
    _batchTimer = null;
    _batchQueue.clear();
    _dedupeCache.clear();
    _rateLimitCounter.clear();
  }

  String _stripAnsi(String text) {
    final ansiRegex = RegExp(r'\x1B\[[0-9;]*[a-zA-Z]');
    return text.replaceAll(ansiRegex, '');
  }
}
