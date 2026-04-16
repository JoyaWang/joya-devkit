/// Functional error handling wrapper for synchronous and asynchronous operations.
///
/// A [Result] is either a [Result.success] with a value of type [T],
/// or a [Result.failure] with an error message.
class Result<T> {
  final T? _data;
  final String? _error;
  final bool _isSuccess;

  const Result.success(T data)
      : _data = data,
        _error = null,
        _isSuccess = true;

  const Result.failure(String error)
      : _data = null,
        _error = error,
        _isSuccess = false;

  bool get isSuccess => _isSuccess;
  bool get isFailure => !_isSuccess;

  T? get data => _data;
  String? get error => _error;

  /// Returns the success value or throws an [Exception] with the error message.
  T getOrThrow() {
    if (_isSuccess) {
      return _data as T;
    }
    throw Exception(_error);
  }

  /// Pattern-matches on the result.
  ///
  /// Calls [onSuccess] if this is a success, otherwise calls [onFailure].
  R fold<R>(R Function(String error) onFailure, R Function(T data) onSuccess) {
    if (_isSuccess) {
      return onSuccess(_data as T);
    }
    return onFailure(_error ?? 'Unknown error');
  }

  @override
  String toString() =>
      _isSuccess ? 'Result.success($_data)' : 'Result.failure($_error)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Result<T> &&
          runtimeType == other.runtimeType &&
          _isSuccess == other._isSuccess &&
          _data == other._data &&
          _error == other._error;

  @override
  int get hashCode => Object.hash(_isSuccess, _data, _error);
}
