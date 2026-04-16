# joya_feedback_kit

Crash reporting, error reporting and feedback kit for Joya Flutter.

## Features

- `JoyaFeedbackKit.init()` — one-line integration for crash and error reporting
- `CrashReporterService` — capture, persist, and report crashes with gzip compression
- `ErrorReporterService` — remote switch + gzip batch error reporting
- `ErrorReportingOutput` — `LogOutput` that intercepts `Level.error` with deduplication, rate limiting, and batching
- `CrashInfo` / `ErrorInfo` — structured information models

## Quick Start

### main.dart

```dart
import 'package:flutter/material.dart';
import 'package:joya_feedback_kit/joya_feedback_kit.dart';
import 'package:logger/logger.dart';

void main() {
  JoyaFeedbackKit.init(
    config: const JoyaFeedbackKitConfig(
      projectKey: 'my_app',
      apiBaseUrl: 'https://api.example.com',
      keyPrefix: 'myapp_',
      enableCrashReporting: true,
      enableErrorReporting: true,
      // Optional: customize ignored error patterns
      // errorIgnorePatterns: ['SocketException'],
    ),
    appRunner: () => runApp(const MyApp()),
  );

  // Optional: set user info after login
  JoyaFeedbackKit.setUserInfo(
    userId: () => 'user_123',
    username: () => 'Alice',
  );

  // Optional: set current route provider
  JoyaFeedbackKit.setCurrentRouteProvider(() => '/home');
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: Scaffold(
        body: Center(
          child: ElevatedButton(
            onPressed: () {
              // Use the default logger created by JoyaFeedbackKit
              JoyaFeedbackKit.logger?.e('Something went wrong!');
            },
            child: const Text('Trigger Error Log'),
          ),
        ),
      ),
    );
  }
}
```

### Using your own Logger

If you already have a `Logger` instance, pass `JoyaFeedbackKit.errorReportingOutput` into its outputs:

```dart
final logger = Logger(
  output: MultiOutput([
    ConsoleOutput(),
    if (JoyaFeedbackKit.errorReportingOutput != null)
      JoyaFeedbackKit.errorReportingOutput!,
  ]),
);
```

## Manual Usage

### CrashReporterService

```dart
import 'package:joya_feedback_kit/joya_feedback_kit.dart';
import 'package:dio/dio.dart';

final service = CrashReporterService(
  dio: Dio(),
  baseUrl: 'https://api.example.com',
  keyPrefix: 'myapp_',
);

// Report a crash immediately
await service.reportCrash(
  error: error,
  stackTrace: stackTrace,
  source: 'runZonedGuarded',
);

// Retry pending crash on app startup
final result = await service.checkAndReportPendingCrash();
```

### ErrorReporterService

```dart
import 'package:joya_feedback_kit/joya_feedback_kit.dart';
import 'package:dio/dio.dart';

final service = ErrorReporterService(
  dio: Dio(),
  baseUrl: 'https://api.example.com',
);

final enabled = await service.isEnabled();

final result = await service.reportErrors([
  ErrorInfo(
    errorMessage: 'Timeout',
    source: 'network',
    timestamp: DateTime.now(),
  ),
]);
```

## Testing

```bash
flutter test
```
