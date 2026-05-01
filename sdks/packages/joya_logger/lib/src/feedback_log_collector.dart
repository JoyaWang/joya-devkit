import 'file_rotation_output.dart';
import 'memory_output.dart';

/// Collects logs for manual feedback reports.
///
/// This mirrors the Laicai feedback behavior: explicit logs win, otherwise the
/// collector reads file rotation logs for a time range and appends in-memory
/// logs. Empty sources return an empty string so callers can skip log uploads.
class FeedbackLogCollector {
  FeedbackLogCollector({
    required MemoryOutput memoryLogOutput,
    required FileRotationOutput fileLogOutput,
    this.occurrenceWindow = const Duration(minutes: 10),
    this.defaultLookback = const Duration(minutes: 10),
    DateTime Function()? now,
  })  : _memoryLogOutput = memoryLogOutput,
        _fileLogOutput = fileLogOutput,
        _now = now ?? DateTime.now;

  final MemoryOutput _memoryLogOutput;
  final FileRotationOutput _fileLogOutput;
  final DateTime Function() _now;

  /// Window used when users can provide the actual occurrence time.
  final Duration occurrenceWindow;

  /// Lookback used when only feedback entry/submission time is available.
  final Duration defaultLookback;

  /// Collects logs for a feedback report.
  ///
  /// If [explicitLogsText] is non-empty after trimming, it is returned as-is.
  /// Otherwise:
  /// - with [occurrenceTime], read file logs in +/- [occurrenceWindow]
  /// - without [occurrenceTime], read file logs from
  ///   `(entryTime ?? now) - defaultLookback` to `(entryTime ?? now)`
  /// Then append memory logs.
  Future<String> collectLogs({
    String? explicitLogsText,
    DateTime? occurrenceTime,
    DateTime? entryTime,
  }) async {
    if (explicitLogsText != null && explicitLogsText.trim().isNotEmpty) {
      return explicitLogsText;
    }

    final range = _resolveLogTimeRange(
      occurrenceTime: occurrenceTime,
      entryTime: entryTime,
    );

    final buffer = StringBuffer();

    final fileLogs = await _fileLogOutput.getLogsForRange(
      start: range.start,
      end: range.end,
    );
    if (fileLogs.trim().isNotEmpty) {
      buffer.writeln('=== FILE LOGS START ===');
      buffer.writeln(fileLogs.trimRight());
      buffer.writeln('=== FILE LOGS END ===');
    }

    final memoryLogs = _memoryLogOutput.logsText;
    if (memoryLogs.trim().isNotEmpty) {
      if (buffer.isNotEmpty) {
        buffer.writeln();
      }
      buffer.writeln('=== MEMORY LOGS START ===');
      buffer.writeln(memoryLogs.trimRight());
      buffer.writeln('=== MEMORY LOGS END ===');
    }

    return buffer.toString().trimRight();
  }

  _FeedbackLogTimeRange _resolveLogTimeRange({
    DateTime? occurrenceTime,
    DateTime? entryTime,
  }) {
    if (occurrenceTime != null) {
      return _FeedbackLogTimeRange(
        start: occurrenceTime.subtract(occurrenceWindow),
        end: occurrenceTime.add(occurrenceWindow),
      );
    }

    final end = entryTime ?? _now();
    return _FeedbackLogTimeRange(
      start: end.subtract(defaultLookback),
      end: end,
    );
  }
}

class _FeedbackLogTimeRange {
  const _FeedbackLogTimeRange({required this.start, required this.end});

  final DateTime start;
  final DateTime end;
}
