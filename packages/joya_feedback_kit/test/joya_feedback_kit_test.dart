import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:joya_feedback_kit/joya_feedback_kit.dart';
import 'package:logger/logger.dart';

void main() {
  final originalOnError = FlutterError.onError;

  tearDown(() {
    JoyaFeedbackKit.dispose();
    FlutterError.onError = originalOnError;
  });

  group('JoyaFeedbackKit', () {
    test('init creates crash and error services when enabled', () {
      JoyaFeedbackKit.init(
        config: const JoyaFeedbackKitConfig(
          projectKey: 'p1',
          apiBaseUrl: 'https://example.com',
        ),
        appRunner: () {},
      );
      expect(JoyaFeedbackKit.crashReporterService, isNotNull);
      expect(JoyaFeedbackKit.errorReporterService, isNotNull);
      expect(JoyaFeedbackKit.errorReportingOutput, isNotNull);
    });

    test('init does not create services when disabled', () {
      JoyaFeedbackKit.init(
        config: const JoyaFeedbackKitConfig(
          projectKey: 'p1',
          apiBaseUrl: 'https://example.com',
          enableCrashReporting: false,
          enableErrorReporting: false,
        ),
        appRunner: () {},
      );
      expect(JoyaFeedbackKit.crashReporterService, isNull);
      expect(JoyaFeedbackKit.errorReporterService, isNull);
      expect(JoyaFeedbackKit.errorReportingOutput, isNull);
    });

    test('init creates default logger when no external logger is provided', () {
      JoyaFeedbackKit.init(
        config: const JoyaFeedbackKitConfig(
          projectKey: 'p1',
          apiBaseUrl: 'https://example.com',
        ),
        appRunner: () {},
      );
      expect(JoyaFeedbackKit.logger, isNotNull);
    });

    test('init uses provided logger', () {
      final customLogger = Logger();
      JoyaFeedbackKit.init(
        config: const JoyaFeedbackKitConfig(
          projectKey: 'p1',
          apiBaseUrl: 'https://example.com',
          enableErrorReporting: false,
        ),
        appRunner: () {},
        logger: customLogger,
      );
      expect(JoyaFeedbackKit.logger, same(customLogger));
    });

    test('setUserInfo propagates to services', () {
      JoyaFeedbackKit.init(
        config: const JoyaFeedbackKitConfig(
          projectKey: 'p1',
          apiBaseUrl: 'https://example.com',
        ),
        appRunner: () {},
      );
      expect(() {
        JoyaFeedbackKit.setUserInfo(
          userId: () => 'u1',
          username: () => 'Alice',
        );
      }, returnsNormally);
    });

    test('setCurrentRouteProvider propagates to services', () {
      JoyaFeedbackKit.init(
        config: const JoyaFeedbackKitConfig(
          projectKey: 'p1',
          apiBaseUrl: 'https://example.com',
        ),
        appRunner: () {},
      );
      expect(() {
        JoyaFeedbackKit.setCurrentRouteProvider(() => '/home');
      }, returnsNormally);
    });

    test('dispose clears resources', () {
      JoyaFeedbackKit.init(
        config: const JoyaFeedbackKitConfig(
          projectKey: 'p1',
          apiBaseUrl: 'https://example.com',
        ),
        appRunner: () {},
      );
      JoyaFeedbackKit.dispose();
      expect(JoyaFeedbackKit.crashReporterService, isNull);
      expect(JoyaFeedbackKit.errorReporterService, isNull);
      expect(JoyaFeedbackKit.errorReportingOutput, isNull);
      expect(JoyaFeedbackKit.logger, isNull);
    });
  });
}
