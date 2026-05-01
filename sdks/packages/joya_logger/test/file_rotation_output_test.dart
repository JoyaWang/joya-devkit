import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:joya_logger/src/file_rotation_output.dart';
import 'package:logger/logger.dart';

void main() {
  group('FileRotationOutput', () {
    late Directory tempDir;
    late FileRotationOutput output;

    setUp(() async {
      tempDir = await Directory.systemTemp.createTemp('joya_logger_test_');
      output = FileRotationOutput(
        retentionPeriod: const Duration(days: 3),
        directoryName: 'logs',
        logDirectory: tempDir,
      );
      await output.init();
    });

    tearDown(() async {
      if (await tempDir.exists()) {
        await tempDir.delete(recursive: true);
      }
    });

    test('writes logs to hourly file', () async {
      final event = OutputEvent(
        LogEvent(Level.info, 'hello world'),
        ['hello world'],
      );
      output.output(event);

      // Wait for async write
      await Future.delayed(const Duration(milliseconds: 100));

      final files = await tempDir.list().toList();
      expect(files.whereType<File>().length, 1);

      final file = files.whereType<File>().first;
      final content = await file.readAsString();
      expect(content, contains('hello world'));
      expect(content, contains('info'));
    });

    test('cleans old logs beyond retention period', () async {
      final oldFile = File('${tempDir.path}/log_20250101_12.txt');
      await oldFile.writeAsString('old log');

      final recentFileName = _logFileNameFor(DateTime.now());
      final recentFile = File('${tempDir.path}/$recentFileName');
      await recentFile.writeAsString('recent log');

      // Re-init triggers _cleanOldLogs
      await output.init();
      await Future.delayed(const Duration(milliseconds: 100));

      expect(await oldFile.exists(), isFalse);
      expect(await recentFile.exists(), isTrue);
    });

    test('getLogsForRange returns logs within range', () async {
      final now = DateTime(2026, 4, 17, 10, 30, 0);
      final fileName = 'log_20260417_10.txt';
      final file = File('${tempDir.path}/$fileName');
      await file.writeAsString(
        '[2026-04-17 10:29:00.000] INFO: early\n'
        '[2026-04-17 10:30:00.000] INFO: on time\n'
        '[2026-04-17 10:31:00.000] INFO: late\n',
      );

      final logs = await output.getLogsForRange(
        start: now.subtract(const Duration(minutes: 1)),
        end: now.add(const Duration(minutes: 1)),
      );

      expect(logs, contains('on time'));
      expect(logs, contains('early'));
      expect(logs, contains('late'));
    });

    test('getLogsForRange excludes out-of-range lines', () async {
      final now = DateTime(2026, 4, 17, 10, 30, 0);
      final file = File('${tempDir.path}/log_20260417_10.txt');
      await file.writeAsString(
        '[2026-04-17 09:00:00.000] INFO: too early\n'
        '[2026-04-17 10:30:00.000] INFO: in range\n'
        '[2026-04-17 11:00:00.000] INFO: too late\n',
      );

      final logs = await output.getLogsForRange(
        start: now.subtract(const Duration(minutes: 5)),
        end: now.add(const Duration(minutes: 5)),
      );

      expect(logs, contains('in range'));
      expect(logs, isNot(contains('too early')));
      expect(logs, isNot(contains('too late')));
    });

    test('getLogFilenamesForRange returns sorted filenames', () async {
      File('${tempDir.path}/log_20260417_08.txt'); // does not exist
      final file2 = File('${tempDir.path}/log_20260417_09.txt');
      final file3 = File('${tempDir.path}/log_20260417_10.txt');
      await file2.writeAsString('9');
      await file3.writeAsString('10');

      final files = await output.getLogFilenamesForRange(
        start: DateTime(2026, 4, 17, 8),
        end: DateTime(2026, 4, 17, 10),
      );

      expect(files, ['log_20260417_09.txt', 'log_20260417_10.txt']);
    });

    test('ignores empty lines and box drawing characters', () async {
      final event = OutputEvent(
        LogEvent(Level.debug, 'test'),
        ['', '   ', '│───│', 'real message'],
      );
      output.output(event);
      await Future.delayed(const Duration(milliseconds: 100));

      final files = await tempDir.list().toList();
      final file = files.whereType<File>().first;
      final content = await file.readAsString();
      expect(content, contains('real message'));
      expect(content, isNot(contains('│───│')));
    });
  });
}

String _logFileNameFor(DateTime time) {
  final year = time.year.toString().padLeft(4, '0');
  final month = time.month.toString().padLeft(2, '0');
  final day = time.day.toString().padLeft(2, '0');
  final hour = time.hour.toString().padLeft(2, '0');
  return 'log_${year}${month}${day}_$hour.txt';
}
