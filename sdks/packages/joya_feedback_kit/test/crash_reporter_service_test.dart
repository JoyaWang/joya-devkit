import 'dart:convert';
import 'dart:io';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:joya_feedback_kit/joya_feedback_kit.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
  });

  group('CrashReporterService', () {
    Dio _createMockDio({bool success = true}) {
      final dio = Dio();
      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          handler.resolve(
            Response(
              requestOptions: options,
              data: jsonEncode({'success': success, 'crashId': 'crash-123'}),
              statusCode: 200,
            ),
          );
        },
      ));
      return dio;
    }

    test('reportCrash persists info and reports immediately', () async {
      final dio = _createMockDio();
      final service = CrashReporterService(
        dio: dio,
        baseUrl: 'https://example.com',
      );

      await service.reportCrash(
        error: Exception('test crash'),
        stackTrace: StackTrace.current,
        source: 'test',
      );

      final pending = await service.checkPendingCrash();
      expect(pending, isNull);
    });

    test('checkAndReportPendingCrash retries stored crash', () async {
      // First report fails so crash stays pending
      final dio = _createMockDio(success: false);
      final service = CrashReporterService(
        dio: dio,
        baseUrl: 'https://example.com',
      );

      await service.reportCrash(
        error: Exception('test crash'),
        stackTrace: StackTrace.current,
        source: 'test',
      );

      expect(await service.checkPendingCrash(), isNotNull);

      // Re-create service to simulate restart and succeed
      final dio2 = _createMockDio();
      final service2 = CrashReporterService(
        dio: dio2,
        baseUrl: 'https://example.com',
      );

      final result = await service2.checkAndReportPendingCrash();
      expect(result, isNotNull);
      expect(result!.success, isTrue);
      expect(result.crashId, 'crash-123');
    });

    test('deduplicates reports within 8 seconds', () async {
      var requestCount = 0;
      final dio = Dio();
      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          requestCount++;
          handler.resolve(
            Response(
              requestOptions: options,
              data: jsonEncode({'success': true, 'crashId': 'crash-123'}),
              statusCode: 200,
            ),
          );
        },
      ));

      final service = CrashReporterService(
        dio: dio,
        baseUrl: 'https://example.com',
      );

      final error = Exception('same crash');
      final stack = StackTrace.current;

      await service.reportCrash(error: error, stackTrace: stack, source: 'test');
      await service.reportCrash(error: error, stackTrace: stack, source: 'test');

      expect(requestCount, 1);
    });

    test('uses configurable keyPrefix', () async {
      // Use success=false so crash stays pending and we can inspect the key
      final dio = _createMockDio(success: false);
      final service = CrashReporterService(
        dio: dio,
        baseUrl: 'https://example.com',
        keyPrefix: 'myapp_',
      );

      await service.reportCrash(
        error: Exception('test'),
        stackTrace: StackTrace.current,
        source: 'test',
      );

      final prefs = await SharedPreferences.getInstance();
      expect(prefs.containsKey('myapp_pending_crash_info'), isTrue);
      expect(prefs.containsKey('joya_pending_crash_info'), isFalse);
    });

    test('sends gzip compressed payload', () async {
      RequestOptions? capturedOptions;
      final dio = Dio();
      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          capturedOptions = options;
          handler.resolve(
            Response(
              requestOptions: options,
              data: jsonEncode({'success': true, 'crashId': 'crash-123'}),
              statusCode: 200,
            ),
          );
        },
      ));

      final service = CrashReporterService(
        dio: dio,
        baseUrl: 'https://example.com',
      );

      await service.reportCrash(
        error: Exception('test'),
        stackTrace: StackTrace.current,
        source: 'test',
      );

      expect(capturedOptions, isNotNull);
      expect(capturedOptions!.headers['Content-Encoding'], 'gzip');
      expect(capturedOptions!.data, isA<List<int>>());
      // Verify it's actually gzip (magic bytes 0x1f 0x8b)
      final bytes = capturedOptions!.data as List<int>;
      expect(bytes.length, greaterThan(2));
      expect(bytes[0], 0x1f);
      expect(bytes[1], 0x8b);
    });

    test('clearPendingCrash removes stored crash', () async {
      final dio = _createMockDio(success: false);
      final service = CrashReporterService(
        dio: dio,
        baseUrl: 'https://example.com',
      );

      await service.reportCrash(
        error: Exception('test'),
        stackTrace: StackTrace.current,
        source: 'test',
      );

      expect(await service.checkPendingCrash(), isNotNull);
      await service.clearPendingCrash();
      expect(await service.checkPendingCrash(), isNull);
    });

    test('reportCrash includes route and user info', () async {
      RequestOptions? capturedOptions;
      final dio = Dio();
      dio.interceptors.add(InterceptorsWrapper(
        onRequest: (options, handler) {
          capturedOptions = options;
          handler.resolve(
            Response(
              requestOptions: options,
              data: jsonEncode({'success': true, 'crashId': 'crash-123'}),
              statusCode: 200,
            ),
          );
        },
      ));

      final service = CrashReporterService(
        dio: dio,
        baseUrl: 'https://example.com',
      )
        ..setCurrentRouteProvider(() => '/home')
        ..setUserInfoCallbacks(getUserId: () => 'u1', getUsername: () => 'Alice');

      await service.reportCrash(
        error: Exception('test'),
        stackTrace: StackTrace.current,
        source: 'test',
      );

      final body = capturedOptions!.data as List<int>;
      final decoded = utf8.decode(gzip.decode(body));
      final payload = jsonDecode(decoded) as Map<String, dynamic>;

      expect(payload['currentRoute'], '/home');
      expect(payload['userId'], 'u1');
      expect(payload['username'], 'Alice');
    });
  });
}
