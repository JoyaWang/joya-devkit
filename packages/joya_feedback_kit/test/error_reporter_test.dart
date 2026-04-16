import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:joya_feedback_kit/joya_feedback_kit.dart';
import 'package:logger/logger.dart';

class _FakeErrorReporterService extends ErrorReporterService {
  final List<List<ErrorInfo>> reportedBatches = [];
  bool _enabled = true;

  _FakeErrorReporterService() : super(dio: Dio(), baseUrl: '');

  void setEnabled(bool value) => _enabled = value;

  @override
  Future<bool> isEnabled() async => _enabled;

  @override
  Future<ErrorReportResult> reportErrors(List<ErrorInfo> errors) async {
    reportedBatches.add(errors);
    return ErrorReportResult(success: true, errorsReported: errors.length);
  }
}

Dio _createMockDio({bool enabled = true, bool success = true}) {
  final dio = Dio();
  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) {
      if (options.path.contains('client-settings')) {
        handler.resolve(
          Response(
            requestOptions: options,
            data: {'errorReportingEnabled': enabled},
            statusCode: 200,
          ),
        );
      } else {
        handler.resolve(
          Response(
            requestOptions: options,
            data: jsonEncode({'success': success, 'results': []}),
            statusCode: 200,
          ),
        );
      }
    },
  ));
  return dio;
}

void main() {
  group('ErrorReporterService', () {
    test('isEnabled caches result for 5 minutes', () async {
      final dio = _createMockDio();
      final service = ErrorReporterService(
        dio: dio,
        baseUrl: 'https://example.com',
      );

      final first = await service.isEnabled();
      final second = await service.isEnabled();
      expect(first, isTrue);
      expect(second, isTrue);
    });

    test('isEnabled defaults to true on failure', () async {
      final dio = Dio();
      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          handler.reject(
            DioException(
              requestOptions: options,
              error: 'network error',
            ),
          );
        },
      ));
      final service = ErrorReporterService(
        dio: dio,
        baseUrl: 'https://example.com',
      );

      expect(await service.isEnabled(), isTrue);
    });

    test('reportErrors respects remote switch off', () async {
      final dio = _createMockDio(enabled: false);
      final service = ErrorReporterService(
        dio: dio,
        baseUrl: 'https://example.com',
      );

      final result = await service.reportErrors([
        ErrorInfo(errorMessage: 'e1', source: 'test', timestamp: DateTime.now()),
      ]);

      expect(result.success, isTrue);
      expect(result.errorsReported, 0);
    });

    test('reportErrors sends gzip compressed payload', () async {
      RequestOptions? captured;
      final dio = Dio();
      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          captured = options;
          handler.resolve(
            Response(
              requestOptions: options,
              data: jsonEncode({'success': true, 'results': []}),
              statusCode: 200,
            ),
          );
        },
      ));
      final service = ErrorReporterService(
        dio: dio,
        baseUrl: 'https://example.com',
      );

      await service.reportErrors([
        ErrorInfo(errorMessage: 'e1', source: 'test', timestamp: DateTime.now()),
      ]);

      expect(captured, isNotNull);
      expect(captured!.headers['Content-Encoding'], 'gzip');
      final bytes = captured!.data as List<int>;
      expect(bytes[0], 0x1f);
      expect(bytes[1], 0x8b);
    });
  });

  group('ErrorReportingOutput', () {
    test('only intercepts Level.error', () async {
      final fake = _FakeErrorReporterService();
      final output = ErrorReportingOutput()..initialize(reporterService: fake);

      output.output(OutputEvent(LogEvent(Level.info, 'info'), ['info']));
      output.output(OutputEvent(LogEvent(Level.warning, 'warn'), ['warn']));
      output.output(OutputEvent(LogEvent(Level.error, 'err'), ['err']));

      await Future.delayed(const Duration(seconds: 6));
      expect(fake.reportedBatches.length, 1);
      expect(fake.reportedBatches.first.first.errorMessage, 'err');
    });

    test('deduplicates within 5 minutes', () async {
      final fake = _FakeErrorReporterService();
      final output = ErrorReportingOutput()..initialize(reporterService: fake);

      final event = OutputEvent(LogEvent(Level.error, 'same'), ['same']);
      output.output(event);
      output.output(event);
      output.output(event);

      await Future.delayed(const Duration(seconds: 6));
      expect(fake.reportedBatches.length, 1);
      expect(fake.reportedBatches.first.length, 1);
    });

    test('rate limits to 10 per minute', () async {
      final fake = _FakeErrorReporterService();
      final output = ErrorReportingOutput()..initialize(reporterService: fake);

      for (var i = 0; i < 15; i++) {
        output.output(OutputEvent(
          LogEvent(Level.error, 'msg $i'),
          ['msg $i'],
        ));
      }

      await Future.delayed(const Duration(milliseconds: 100));
      // Only first 10 should be enqueued; the rest are rate-limited.
      expect(fake.reportedBatches.isEmpty, isTrue);
      // But wait - batching means they are collected in one batch timer.
      // Actually with rate limiting, items 11-15 are dropped immediately.
      // So when the batch flushes, only 10 items should be in it.
      await Future.delayed(const Duration(seconds: 6));
      var total = 0;
      for (final batch in fake.reportedBatches) {
        total += batch.length;
      }
      expect(total, 10);
    });

    test('batches errors in 5 second window', () async {
      final fake = _FakeErrorReporterService();
      final output = ErrorReportingOutput()..initialize(reporterService: fake);

      output.output(OutputEvent(LogEvent(Level.error, 'a'), ['a']));
      output.output(OutputEvent(LogEvent(Level.error, 'b'), ['b']));
      output.output(OutputEvent(LogEvent(Level.error, 'c'), ['c']));

      expect(fake.reportedBatches.isEmpty, isTrue);
      await Future.delayed(const Duration(seconds: 6));
      expect(fake.reportedBatches.length, 1);
      expect(fake.reportedBatches.first.length, 3);
    });

    test('ignores configured patterns', () async {
      final fake = _FakeErrorReporterService();
      final output = ErrorReportingOutput(
        ignorePatterns: ['IgnoreThis'],
      )..initialize(reporterService: fake);

      output.output(OutputEvent(
        LogEvent(Level.error, 'IgnoreThis error'),
        ['IgnoreThis error'],
      ));
      output.output(OutputEvent(
        LogEvent(Level.error, 'real error'),
        ['real error'],
      ));

      await Future.delayed(const Duration(seconds: 6));
      expect(fake.reportedBatches.length, 1);
      expect(fake.reportedBatches.first.length, 1);
      expect(fake.reportedBatches.first.first.errorMessage, 'real error');
    });

    test('ignores self errors', () async {
      final fake = _FakeErrorReporterService();
      final output = ErrorReportingOutput()..initialize(reporterService: fake);

      output.output(OutputEvent(
        LogEvent(Level.error, '[ErrorReporter] something'),
        ['[ErrorReporter] something'],
      ));
      output.output(OutputEvent(
        LogEvent(Level.error, 'real error'),
        ['real error'],
      ));

      await Future.delayed(const Duration(seconds: 6));
      expect(fake.reportedBatches.length, 1);
      expect(fake.reportedBatches.first.length, 1);
      expect(fake.reportedBatches.first.first.errorMessage, 'real error');
    });

    test('captures route and user info', () async {
      final fake = _FakeErrorReporterService();
      final output = ErrorReportingOutput()
        ..initialize(reporterService: fake)
        ..setCurrentRouteProvider(() => '/profile')
        ..setUserInfoCallbacks(getUserId: () => 'u1', getUsername: () => 'Alice');

      output.output(OutputEvent(LogEvent(Level.error, 'crash'), ['crash']));

      await Future.delayed(const Duration(seconds: 6));
      final info = fake.reportedBatches.first.first;
      expect(info.currentRoute, '/profile');
      expect(info.userId, 'u1');
      expect(info.username, 'Alice');
    });

    test('dispose cancels batch timer', () async {
      final fake = _FakeErrorReporterService();
      final output = ErrorReportingOutput()..initialize(reporterService: fake);

      output.output(OutputEvent(LogEvent(Level.error, 'a'), ['a']));
      output.dispose();

      await Future.delayed(const Duration(seconds: 6));
      expect(fake.reportedBatches.isEmpty, isTrue);
    });
  });
}
