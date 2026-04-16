import 'package:flutter_test/flutter_test.dart';
import 'package:joya_logger/src/log_cleanup_service.dart';

void main() {
  group('LogCleanupService', () {
    test('removes empty lines and separators', () {
      final raw = 'line1\n\n   \n=====\nline2\n-----\nline3';
      final cleaned = LogCleanupService.cleanLogs(raw);
      expect(cleaned, 'line1\nline2\nline3');
    });

    test('removes duplicate lines keeping first occurrence', () {
      final raw = 'line1\nline2\nline1\nline3\nline2';
      final cleaned = LogCleanupService.cleanLogs(raw);
      expect(cleaned, 'line1\nline2\nline3');
    });

    test('filters debug and verbose logs when enabled', () {
      final raw = '[info] keep\n[debug] drop\n[verbose] drop\n[error] keep';
      final cleaned = LogCleanupService.cleanLogs(raw, filterDebugLogs: true);
      expect(cleaned, contains('[info] keep'));
      expect(cleaned, contains('[error] keep'));
      expect(cleaned, isNot(contains('[debug] drop')));
      expect(cleaned, isNot(contains('[verbose] drop')));
    });

    test('does not filter debug logs when disabled', () {
      final raw = '[debug] keep';
      final cleaned = LogCleanupService.cleanLogs(raw, filterDebugLogs: false);
      expect(cleaned, contains('[debug] keep'));
    });

    test('limits max lines', () {
      final raw = List.generate(10, (i) => 'line$i').join('\n');
      final cleaned = LogCleanupService.cleanLogs(raw, maxLines: 3);
      expect(cleaned.split('\n').length, 3);
    });

    test('limits max size with truncation notice', () {
      final raw = 'A' * 500;
      final cleaned = LogCleanupService.cleanLogs(raw, maxSize: 100);
      expect(cleaned, contains('...[Logs truncated due to size limit]'));
      expect(cleaned.length <= 100, isTrue);
    });

    test('returns empty string for empty input', () {
      expect(LogCleanupService.cleanLogs(''), '');
    });

    test('getCleanupStats returns correct metrics', () {
      final raw = 'line1\nline2\nline2';
      final cleaned = LogCleanupService.cleanLogs(raw);
      final stats = LogCleanupService.getCleanupStats(raw, cleaned);

      expect(stats['originalLines'], 3);
      expect(stats['cleanedLines'], 2);
      expect(stats['originalSize'], raw.length);
      expect(stats['cleanedSize'], cleaned.length);
      expect(stats['reductionPercent'], greaterThanOrEqualTo(0));
    });

    test('getCleanupSummary returns formatted string', () {
      final raw = 'abc';
      final cleaned = 'ab';
      final summary = LogCleanupService.getCleanupSummary(raw, cleaned);
      expect(summary, contains('字节'));
      expect(summary, contains('减少'));
    });
  });
}
