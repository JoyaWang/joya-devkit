import 'package:flutter_secure_storage/flutter_secure_storage.dart';

abstract class SecureStorage {
  Future<String?> read({required String key});
  Future<void> write({required String key, required String? value});
  Future<void> delete({required String key});
  Future<void> deleteAll();
}

/// Default [SecureStorage] adapter using FlutterSecureStorage.
///
/// Platform options can be overridden via constructor parameters.
/// If no options are provided, sensible defaults are used:
/// - Android: encryptedSharedPreferences = true
/// - iOS: accessibility = first_unlock
/// - macOS: useDataProtectionKeyChain = false
class FlutterSecureStorageAdapter implements SecureStorage {
  final FlutterSecureStorage _storage;

  FlutterSecureStorageAdapter({
    AndroidOptions? aOptions,
    IOSOptions? iOptions,
    MacOsOptions? mOptions,
    LinuxOptions? lOptions,
    WindowsOptions? wOptions,
    WebOptions? webOptions,
  }) : _storage = FlutterSecureStorage(
          aOptions: aOptions ?? const AndroidOptions(encryptedSharedPreferences: true),
          iOptions: iOptions ?? const IOSOptions(accessibility: KeychainAccessibility.first_unlock),
          mOptions: mOptions ?? const MacOsOptions(useDataProtectionKeyChain: false),
          lOptions: lOptions ?? const LinuxOptions(),
          wOptions: wOptions ?? const WindowsOptions(),
          webOptions: webOptions ?? const WebOptions(),
        );

  /// Create from an existing [FlutterSecureStorage] instance.
  FlutterSecureStorageAdapter.fromInstance(this._storage);

  @override
  Future<String?> read({required String key}) => _storage.read(key: key);

  @override
  Future<void> write({required String key, required String? value}) =>
      _storage.write(key: key, value: value);

  @override
  Future<void> delete({required String key}) => _storage.delete(key: key);

  @override
  Future<void> deleteAll() => _storage.deleteAll();
}
