/// Log cleanup service.
///
/// Removes noise, duplicates, separator lines, and limits size.
class LogCleanupService {
  static const int maxLogLines = 500;
  static const int maxLogSize = 200 * 1024; // 200KB
  static const Set<String> filteredLevels = {'DEBUG', 'VERBOSE'};

  /// Cleans raw log text.
  static String cleanLogs(
    String rawLogs, {
    bool filterDebugLogs = true,
    int maxLines = maxLogLines,
    int maxSize = maxLogSize,
  }) {
    if (rawLogs.isEmpty) return '';

    final lines = rawLogs.split('\n');
    final cleanedLines = <String>[];
    final seenLines = <String>{};

    for (final line in lines) {
      if (line.trim().isEmpty) continue;
      if (_isSeparatorLine(line)) continue;
      if (filterDebugLogs && _shouldFilterLog(line)) continue;

      final trimmedLine = line.trim();
      if (seenLines.contains(trimmedLine)) continue;

      cleanedLines.add(line);
      seenLines.add(trimmedLine);

      if (cleanedLines.length >= maxLines) break;
    }

    var result = cleanedLines.join('\n');
    if (result.length > maxSize) {
      const prefix = '...[Logs truncated due to size limit]\n';
      final keepLength = maxSize - prefix.length;
      if (keepLength > 0) {
        result = '$prefix${result.substring(result.length - keepLength)}';
      } else {
        result = prefix.trim();
      }
    }

    return result;
  }

  static bool _isSeparatorLine(String line) {
    final trimmed = line.trim();
    if (trimmed.isEmpty) return false;
    final firstChar = trimmed[0];
    if (firstChar != '=' && firstChar != '-' && firstChar != '_') {
      return false;
    }
    if (trimmed.length < 5) return false;
    return trimmed.split('').every((c) => c == firstChar);
  }

  static bool _shouldFilterLog(String line) {
    final lowerLine = line.toLowerCase();
    return lowerLine.contains('[debug]') || lowerLine.contains('[verbose]');
  }

  /// Returns cleanup statistics.
  static Map<String, dynamic> getCleanupStats(String raw, String cleaned) {
    final rawLines = raw.split('\n');
    final cleanedLines = cleaned.split('\n');
    final rawSize = raw.length;
    final cleanedSize = cleaned.length;
    final reductionRate =
        rawSize > 0 ? ((1 - cleanedSize / rawSize) * 100).toInt() : 0;

    return {
      'originalLines': rawLines.length,
      'cleanedLines': cleanedLines.length,
      'originalSize': rawSize,
      'cleanedSize': cleanedSize,
      'reductionPercent': reductionRate,
    };
  }

  /// Returns a concise summary string.
  static String getCleanupSummary(String raw, String cleaned) {
    final stats = getCleanupStats(raw, cleaned);
    return '日志清理: ${stats['originalSize']} → ${stats['cleanedSize']} 字节 '
        '(减少 ${stats['reductionPercent']}%)';
  }
}
