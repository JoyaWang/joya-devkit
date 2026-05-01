import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:joya_logger/joya_logger.dart';
import 'package:logger/logger.dart' show Level, LogEvent, OutputEvent;

void main() {
  group('FeedbackLogCollector', () {
    late Directory tempDir;
    late MemoryOutput memoryOutput;
    late FileRotationOutput fileOutput;
    late FeedbackLogCollector collector;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp(
        'feedback_log_collector_test_',
      );
      memoryOutput = MemoryOutput(bufferSize: 20);
      fileOutput = FileRotationOutput(logDirectory: tempDir);
      await fileOutput.init();
      collector = FeedbackLogCollector(
        memoryLogOutput: memoryOutput,
        fileLogOutput: fileOutput,
        now: () => DateTime(2026, 5, 1, 12, 30),
      );
    });

    tearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('returns explicit logs without adding sections', () async {
      await _writeLogFile(
        tempDir,
        'log_20260501_12.txt',
        '[2026-05-01 12:29:00.000] info: file log\n',
      );
      memoryOutput.output(
        OutputEvent(LogEvent(Level.info, 'memory log'), ['memory log']),
      );

      final logs = await collector.collectLogs(
        explicitLogsText: 'explicit log line',
        entryTime: DateTime(2026, 5, 1, 12, 30),
      );

      expect(logs, 'explicit log line');
      expect(logs, isNot(contains('FILE LOGS START')));
      expect(logs, isNot(contains('MEMORY LOGS START')));
    });

    test('collects file logs around occurrenceTime plus memory logs', () async {
      await _writeLogFile(
        tempDir,
        'log_20260501_10.txt',
        '[2026-05-01 10:49:59.999] info: too early\n'
            '[2026-05-01 10:50:00.000] info: early boundary\n'
            '[2026-05-01 11:00:00.000] info: incident\n'
            '[2026-05-01 11:10:00.000] info: late boundary\n'
            '[2026-05-01 11:10:00.001] info: too late\n',
      );
      await _writeLogFile(
        tempDir,
        'log_20260501_11.txt',
        '[2026-05-01 11:05:00.000] info: next hour file\n',
      );
      memoryOutput.output(
        OutputEvent(LogEvent(Level.warning, 'memory warning'), [
          'memory warning',
        ]),
      );

      final logs = await collector.collectLogs(
        occurrenceTime: DateTime(2026, 5, 1, 11),
      );

      expect(logs, contains('=== FILE LOGS START ==='));
      expect(logs, contains('early boundary'));
      expect(logs, contains('incident'));
      expect(logs, contains('next hour file'));
      expect(logs, contains('late boundary'));
      expect(logs, isNot(contains('too early')));
      expect(logs, isNot(contains('too late')));
      expect(logs, contains('=== FILE LOGS END ==='));
      expect(logs, contains('=== MEMORY LOGS START ==='));
      expect(logs, contains('memory warning'));
      expect(logs, contains('=== MEMORY LOGS END ==='));
    });

    test('uses entryTime minus default lookback when occurrenceTime is absent',
        () async {
      await _writeLogFile(
        tempDir,
        'log_20260501_12.txt',
        '[2026-05-01 12:19:59.999] info: before lookback\n'
            '[2026-05-01 12:20:00.000] info: lookback boundary\n'
            '[2026-05-01 12:25:00.000] info: in range\n'
            '[2026-05-01 12:30:00.000] info: end boundary\n'
            '[2026-05-01 12:30:00.001] info: after end\n',
      );

      final logs = await collector.collectLogs(
        entryTime: DateTime(2026, 5, 1, 12, 30),
      );

      expect(logs, contains('lookback boundary'));
      expect(logs, contains('in range'));
      expect(logs, contains('end boundary'));
      expect(logs, isNot(contains('before lookback')));
      expect(logs, isNot(contains('after end')));
    });

    test('uses injected now when no times are provided', () async {
      await _writeLogFile(
        tempDir,
        'log_20260501_12.txt',
        '[2026-05-01 12:20:00.000] info: now fallback start\n'
            '[2026-05-01 12:30:00.000] info: now fallback end\n'
            '[2026-05-01 12:31:00.000] info: outside now fallback\n',
      );

      final logs = await collector.collectLogs();

      expect(logs, contains('now fallback start'));
      expect(logs, contains('now fallback end'));
      expect(logs, isNot(contains('outside now fallback')));
    });

    test('returns memory logs when file logs are empty', () async {
      memoryOutput.output(
        OutputEvent(LogEvent(Level.info, 'only memory'), ['only memory']),
      );

      final logs = await collector.collectLogs(
        entryTime: DateTime(2026, 5, 1, 12, 30),
      );

      expect(logs, isNot(contains('FILE LOGS START')));
      expect(logs, contains('=== MEMORY LOGS START ==='));
      expect(logs, contains('only memory'));
    });

    test('returns empty string when file and memory logs are empty', () async {
      final logs = await collector.collectLogs(
        entryTime: DateTime(2026, 5, 1, 12, 30),
      );

      expect(logs, isEmpty);
    });
  });
}

Future<void> _writeLogFile(
  Directory dir,
  String fileName,
  String content,
) async {
  final file = File('${dir.path}/$fileName');
  await file.writeAsString(content);
}
