import 'secure_storage.dart';

/// In-memory implementation of [SecureStorage] for testing.
class InMemorySecureStorage implements SecureStorage {
  final Map<String, String> _data = {};

  Map<String, String> get data => Map.unmodifiable(_data);

  @override
  Future<void> delete({required String key}) async {
    _data.remove(key);
  }

  @override
  Future<void> deleteAll() async {
    _data.clear();
  }

  @override
  Future<String?> read({required String key}) async {
    return _data[key];
  }

  @override
  Future<void> write({required String key, required String? value}) async {
    if (value == null) {
      _data.remove(key);
    } else {
      _data[key] = value;
    }
  }
}
