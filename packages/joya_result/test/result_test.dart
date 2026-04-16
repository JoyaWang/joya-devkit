import 'package:joya_result/joya_result.dart';
import 'package:test/test.dart';

void main() {
  group('Result', () {
    test('success constructs correctly', () {
      const result = Result<int>.success(42);
      expect(result.isSuccess, isTrue);
      expect(result.isFailure, isFalse);
      expect(result.data, 42);
      expect(result.error, isNull);
    });

    test('failure constructs correctly', () {
      const result = Result<int>.failure('something went wrong');
      expect(result.isSuccess, isFalse);
      expect(result.isFailure, isTrue);
      expect(result.data, isNull);
      expect(result.error, 'something went wrong');
    });

    test('getOrThrow returns value on success', () {
      const result = Result<String>.success('hello');
      expect(result.getOrThrow(), 'hello');
    });

    test('getOrThrow throws on failure', () {
      const result = Result<String>.failure('error msg');
      expect(result.getOrThrow, throwsA(isA<Exception>()));
    });

    test('fold calls onSuccess for success', () {
      const result = Result<int>.success(10);
      final value = result.fold(
        (error) => -1,
        (data) => data * 2,
      );
      expect(value, 20);
    });

    test('fold calls onFailure for failure', () {
      const result = Result<int>.failure('bad input');
      final value = result.fold(
        (error) => error.length,
        (data) => data * 2,
      );
      expect(value, 9);
    });

    test('toString formats success', () {
      const result = Result<int>.success(7);
      expect(result.toString(), 'Result.success(7)');
    });

    test('toString formats failure', () {
      const result = Result<int>.failure('oops');
      expect(result.toString(), 'Result.failure(oops)');
    });

    test('equality works for identical results', () {
      const a = Result<int>.success(1);
      const b = Result<int>.success(1);
      expect(a, equals(b));
    });

    test('equality differentiates success and failure', () {
      const a = Result<int>.success(1);
      const b = Result<int>.failure('1');
      expect(a, isNot(equals(b)));
    });
  });
}
