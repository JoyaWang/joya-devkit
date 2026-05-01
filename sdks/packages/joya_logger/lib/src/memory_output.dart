import 'dart:collection';
import 'package:logger/logger.dart';
import 'log_line_sanitizer.dart';

class _MemoryLogRecord {
  final DateTime timestamp;
  final Level level;
  final List<String> lines;

  const _MemoryLogRecord({
    required this.timestamp,
    required this.level,
    required this.lines,
  });
}

/// In-memory ring-buffer log output.
///
/// Keeps the most recent [bufferSize] log records for runtime inspection
/// or attachment to feedback reports.
class MemoryOutput extends LogOutput {
  final int bufferSize;
  final ListQueue<_MemoryLogRecord> _buffer;

  MemoryOutput({this.bufferSize = 100}) : _buffer = ListQueue(bufferSize);

  @override
  void output(OutputEvent event) {
    final sanitizedLines = <String>[];
    for (final line in event.lines) {
      final sanitizedLine = LogLineSanitizer.sanitizeForStorage(line);
      if (sanitizedLine == null) continue;
      sanitizedLines.add(sanitizedLine);
    }
    if (sanitizedLines.isEmpty) return;

    if (_buffer.length >= bufferSize) {
      _buffer.removeFirst();
    }
    _buffer.add(
      _MemoryLogRecord(
        timestamp: DateTime.now(),
        level: event.level,
        lines: sanitizedLines,
      ),
    );
  }

  /// Gets all buffered logs as formatted lines.
  List<String> get logs {
    return _buffer.map((record) {
      final time = record.timestamp.toIso8601String();
      final prefix = '[$time] ${record.level.name}: ';
      return record.lines.map((line) => '$prefix$line').join('\n');
    }).toList(growable: false);
  }

  /// Gets formatted logs as a single text block.
  String get logsText => logs.join('\n');
}
