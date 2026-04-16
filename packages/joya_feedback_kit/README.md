# joya_feedback_kit

Crash reporting, error reporting and feedback kit for Joya Flutter.

## Features

- `CrashReporterService` — capture, persist, and report crashes with gzip compression
- `CrashInfo` — structured crash information model

## CrashReporterService

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

## Testing

```bash
flutter test
```
