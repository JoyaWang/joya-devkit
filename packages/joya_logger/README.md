# joya_logger

Logging utilities with file rotation and memory output for Joya Flutter kits.

## Features

- `FileRotationOutput` — hourly log file rotation with configurable retention
- `LogLineSanitizer` — strips ANSI codes and PrettyPrinter box borders
- `MemoryOutput` — ring-buffer in-memory logs (coming in task 3.2)

## FileRotationOutput

```dart
import 'package:joya_logger/joya_logger.dart';
import 'package:logger/logger.dart';

final logger = Logger(
  output: FileRotationOutput(
    retentionPeriod: const Duration(days: 3),
    directoryName: 'logs',
  ),
);

// Logs are written to files like log_20260417_10.txt
```

### Read logs for a time range

```dart
final output = FileRotationOutput();
await output.init();

final logs = await output.getLogsForRange(
  start: DateTime.now().subtract(const Duration(hours: 1)),
  end: DateTime.now(),
);
```

## Testing

```bash
flutter test
```
