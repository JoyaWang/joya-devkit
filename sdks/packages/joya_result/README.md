# joya_result

Functional error handling with `Result<T>` for Joya Flutter kits.

## Usage

```dart
import 'package:joya_result/joya_result.dart';

Result<int> parseNumber(String input) {
  final value = int.tryParse(input);
  if (value == null) {
    return const Result.failure('Invalid number');
  }
  return Result.success(value);
}

void main() {
  final result = parseNumber('42');

  if (result.isSuccess) {
    print(result.data); // 42
  }

  // Or use fold
  final message = result.fold(
    (error) => 'Failed: $error',
    (data) => 'Success: $data',
  );

  // Or throw on failure
  final value = result.getOrThrow();
}
```

## API

- `Result.success(T data)` – creates a success result.
- `Result.failure(String error)` – creates a failure result.
- `isSuccess` / `isFailure` – boolean getters.
- `data` / `error` – nullable accessors.
- `getOrThrow()` – returns the value or throws an `Exception`.
- `fold<R>(onFailure, onSuccess)` – pattern-matches both branches.
