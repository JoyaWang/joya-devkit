/// Sanitizes log lines for storage.
class LogLineSanitizer {
  static final _ansiEscape = RegExp(r'\x1B\[[0-9;]*m');
  static final _boxChars = RegExp(r'^[┌┐└┘│─\s]*$');

  /// Removes ANSI codes, PrettyPrinter box lines, and empty strings.
  static String? sanitizeForStorage(String line) {
    var cleaned = line.replaceAll(_ansiEscape, '');
    cleaned = cleaned.replaceAll('\u0000', '');
    if (_boxChars.hasMatch(cleaned)) return null;
    cleaned = cleaned.trim();
    if (cleaned.isEmpty) return null;
    return cleaned;
  }
}
