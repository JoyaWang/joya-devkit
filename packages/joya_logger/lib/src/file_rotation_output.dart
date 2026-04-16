import 'dart:convert';
import 'dart:io';
import 'package:intl/intl.dart';
import 'package:logger/logger.dart';
import 'package:path_provider/path_provider.dart';
import 'log_line_sanitizer.dart';

/// File rotation log output.
///
/// Writes logs to local files, rotating by hour, and keeps logs for a configurable retention period.
class FileRotationOutput extends LogOutput {
  final Duration retentionPeriod;
  final String directoryName;
  Directory? _logDir;

  FileRotationOutput({
    this.retentionPeriod = const Duration(days: 3),
    this.directoryName = 'logs',
    Directory? logDirectory,
  }) : _logDir = logDirectory;

  @override
  Future<void> init() async {
    await super.init();
    if (_logDir == null) {
      await _initLogDir();
    } else {
      await _cleanOldLogs();
    }
  }

  /// Initializes the log directory and cleans old logs.
  Future<void> _initLogDir() async {
    try {
      final appDir = await getApplicationDocumentsDirectory();
      final dir = Directory('${appDir.path}/$directoryName');
      if (!await dir.exists()) {
        await dir.create(recursive: true);
      }
      _logDir = dir;
      await _cleanOldLogs();
    } catch (e) {
      // ignore: avoid_print
      print('[FileRotationOutput] Failed to init log dir: $e');
    }
  }

  @override
  void output(OutputEvent event) {
    if (_logDir == null) return;
    _writeLog(event);
  }

  Future<void> _writeLog(OutputEvent event) async {
    try {
      final now = DateTime.now();
      final fileName = 'log_${DateFormat('yyyyMMdd_HH').format(now)}.txt';
      final file = File('${_logDir!.path}/$fileName');

      final timeStr = DateFormat('yyyy-MM-dd HH:mm:ss.SSS').format(now);
      final logLines = <String>[];

      for (final line in event.lines) {
        final sanitizedLine = LogLineSanitizer.sanitizeForStorage(line);
        if (sanitizedLine == null) continue;
        logLines.add('[$timeStr] ${event.level.name}: $sanitizedLine');
      }

      if (logLines.isEmpty) return;

      await file.writeAsString(
        '${logLines.join('\n')}\n',
        mode: FileMode.append,
        encoding: utf8,
      );
    } catch (e) {
      // ignore: avoid_print
      print('[FileRotationOutput] Failed to write log: \$e');
    }
  }

  /// Cleans old logs beyond the retention period.
  Future<void> _cleanOldLogs() async {
    if (_logDir == null) return;

    try {
      final now = DateTime.now();
      final cutoff = now.subtract(retentionPeriod);

      await for (final entity in _logDir!.list()) {
        if (entity is File) {
          final fileName = entity.uri.pathSegments.last;
          if (fileName.startsWith('log_') && fileName.endsWith('.txt')) {
            try {
              final dateStr = fileName.substring(4, 15); // yyyyMMdd_HH
              final fileDate = DateTime(
                int.parse(dateStr.substring(0, 4)),
                int.parse(dateStr.substring(4, 6)),
                int.parse(dateStr.substring(6, 8)),
                int.parse(dateStr.substring(9, 11)),
              );
              if (fileDate.isBefore(cutoff)) {
                await entity.delete();
              }
            } catch (_) {
              // ignore parse failures
            }
          }
        }
      }
    } catch (e) {
      // ignore: avoid_print
      print('[FileRotationOutput] Failed to clean old logs: \$e');
    }
  }

  /// Gets logs around a specific time (default +/- 10 minutes).
  Future<String> getLogsForTime(
    DateTime time, {
    Duration window = const Duration(minutes: 10),
    DateTime? strictEndTime,
  }) async {
    if (_logDir == null) await _initLogDir();
    if (_logDir == null) return '';

    final start = time.subtract(window);
    var end = time.add(window);
    if (strictEndTime != null && strictEndTime.isBefore(end)) {
      end = strictEndTime;
    }

    return getLogsForRange(start: start, end: end);
  }

  /// Gets logs within a specific date range (inclusive).
  Future<String> getLogsForRange({
    required DateTime start,
    required DateTime end,
  }) async {
    if (_logDir == null) await _initLogDir();
    if (_logDir == null) return '';
    if (end.isBefore(start)) return '';

    final logs = StringBuffer();
    final filesToRead = await getLogFilenamesForRange(start: start, end: end);

    for (final fileName in filesToRead) {
      final file = File('${_logDir!.path}/$fileName');
      if (!await file.exists()) continue;

      try {
        final content = await file.readAsString(
          encoding: const Utf8Codec(allowMalformed: true),
        );
        final lines = const LineSplitter().convert(content);
        for (final line in lines) {
          final logTime = _tryParseLogTimestamp(line);
          if (logTime == null) continue;

          final inRange = !logTime.isBefore(start) && !logTime.isAfter(end);
          if (inRange) {
            logs.writeln(line);
          }
        }
      } catch (e) {
        // ignore: avoid_print
        print('[FileRotationOutput] Failed to read log file $fileName: \$e');
      }
    }

    return logs.toString();
  }

  DateTime? _tryParseLogTimestamp(String line) {
    if (!line.startsWith('[')) return null;
    final closeBracketIndex = line.indexOf(']');
    if (closeBracketIndex <= 1) return null;

    final timeStr = line.substring(1, closeBracketIndex);
    try {
      return DateFormat('yyyy-MM-dd HH:mm:ss.SSS').parse(timeStr);
    } catch (_) {
      return null;
    }
  }

  /// Gets log filenames around a specific time (default +/- 10 minutes).
  Future<List<String>> getLogFilenamesForTime(
    DateTime time, {
    Duration window = const Duration(minutes: 10),
  }) async {
    if (_logDir == null) await _initLogDir();
    if (_logDir == null) return [];

    final start = time.subtract(window);
    final end = time.add(window);
    return getLogFilenamesForRange(start: start, end: end);
  }

  /// Gets log filenames within a specific date range (inclusive), sorted.
  Future<List<String>> getLogFilenamesForRange({
    required DateTime start,
    required DateTime end,
  }) async {
    if (_logDir == null) await _initLogDir();
    if (_logDir == null) return [];
    if (end.isBefore(start)) return [];

    final files = <String>[];
    var current = DateTime(start.year, start.month, start.day, start.hour);
    final endTime = DateTime(end.year, end.month, end.day, end.hour);

    while (!current.isAfter(endTime)) {
      final fileName = 'log_${DateFormat('yyyyMMdd_HH').format(current)}.txt';
      final file = File('${_logDir!.path}/$fileName');
      if (await file.exists()) {
        files.add(fileName);
      }
      current = current.add(const Duration(hours: 1));
    }

    files.sort();
    return files;
  }
}
