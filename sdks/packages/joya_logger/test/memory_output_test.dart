import 'package:flutter_test/flutter_test.dart';
import 'package:joya_logger/src/memory_output.dart';
import 'package:logger/logger.dart' hide MemoryOutput;

void main() {
  group('MemoryOutput', () {
    test('buffers sanitized log lines', () {
      final output = MemoryOutput(bufferSize: 10);
      final event = OutputEvent(
        LogEvent(Level.info, 'hello world'),
        ['hello world'],
      );
      output.output(event);

      final logs = output.logs;
      expect(logs.length, 1);
      expect(logs.first, contains('hello world'));
      expect(logs.first, contains('info'));
    });

    test('drops oldest records when buffer is full', () {
      final output = MemoryOutput(bufferSize: 3);
      for (var i = 0; i < 5; i++) {
        output.output(
          OutputEvent(
            LogEvent(Level.info, 'msg $i'),
            ['msg $i'],
          ),
        );
      }

      final logs = output.logs;
      expect(logs.length, 3);
      expect(logs.first, contains('msg 2'));
      expect(logs.last, contains('msg 4'));
    });

    test('ignores empty and box-drawing lines', () {
      final output = MemoryOutput(bufferSize: 10);
      final event = OutputEvent(
        LogEvent(Level.debug, 'test'),
        ['', '   ', '│───│', 'real message'],
      );
      output.output(event);

      expect(output.logsText, isNot(contains('│───│')));
      expect(output.logsText, contains('real message'));
    });

    test('logsText joins records with newlines', () {
      final output = MemoryOutput(bufferSize: 10);
      output.output(
        OutputEvent(LogEvent(Level.warning, 'a'), ['a']),
      );
      output.output(
        OutputEvent(LogEvent(Level.error, 'b'), ['b']),
      );

      final text = output.logsText;
      expect(text, contains('warning'));
      expect(text, contains('error'));
      expect(text.split('\n').length, 2);
    });
  });
}
