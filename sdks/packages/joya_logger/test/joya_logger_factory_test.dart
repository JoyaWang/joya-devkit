import 'package:flutter_test/flutter_test.dart';
import 'package:joya_logger/joya_logger.dart';
import 'package:logger/logger.dart' show Level, ProductionFilter, SimplePrinter;

void main() {
  group('createJoyaLogger', () {
    test('uses ProductionFilter and info level in release mode', () {
      expect(createJoyaLogFilter(), isA<ProductionFilter>());
      expect(resolveJoyaLoggerLevel(releaseMode: true), Level.info);

      final memoryOutput = MemoryOutput();
      final logger = createJoyaLogger(
        outputs: [memoryOutput],
        releaseMode: true,
        printer: SimplePrinter(printTime: false),
      );

      logger.d('release debug omitted');
      logger.i('release info captured');

      expect(memoryOutput.logsText, isNot(contains('release debug omitted')));
      expect(memoryOutput.logsText, contains('release info captured'));
    });

    test('uses ProductionFilter and debug level in non-release mode', () {
      expect(createJoyaLogFilter(), isA<ProductionFilter>());
      expect(resolveJoyaLoggerLevel(releaseMode: false), Level.debug);

      final memoryOutput = MemoryOutput();
      final logger = createJoyaLogger(
        outputs: [memoryOutput],
        releaseMode: false,
        printer: SimplePrinter(printTime: false),
      );

      logger.d('debug captured');

      expect(memoryOutput.logsText, contains('debug captured'));
    });

    test('writes to provided memory output', () {
      final memoryOutput = MemoryOutput();
      final logger = createJoyaLogger(
        outputs: [memoryOutput],
        releaseMode: false,
        printer: SimplePrinter(printTime: false),
      );

      logger.i('factory captured log');

      expect(memoryOutput.logsText, contains('factory captured log'));
    });
  });
}
