import 'dart:async';
import 'secure_storage.dart';

/// Token secure storage service with in-memory cache.
///
/// Uses [SecureStorage] for persistence:
/// - Android: EncryptedSharedPreferences
/// - iOS: Keychain
class TokenService {
  static const String _keyAccessToken = 'auth_access_token';
  static const String _keyRefreshToken = 'auth_refresh_token';
  static const String _keyUserId = 'auth_user_id';
  static const String _keyUserNickname = 'auth_user_nickname';
  static const String _keyUserAvatar = 'auth_user_avatar';
  static const String _keyUserRealNameVerified = 'auth_user_real_name_verified';

  final SecureStorage _storage;
  final String keyPrefix;

  String? _cachedAccessToken;
  String? _cachedRefreshToken;
  String? _cachedUserId;
  String? _cachedNickname;
  String? _cachedAvatar;
  bool? _cachedIsRealNameVerified;
  bool _cacheRestored = false;

  final _authErrorController = StreamController<void>.broadcast();

  TokenService({
    SecureStorage? storage,
    this.keyPrefix = 'joya_',
  }) : _storage = storage ?? FlutterSecureStorageAdapter();

  String get _accessTokenKey => '${keyPrefix}$_keyAccessToken';
  String get _refreshTokenKey => '${keyPrefix}$_keyRefreshToken';
  String get _userIdKey => '${keyPrefix}$_keyUserId';
  String get _nicknameKey => '${keyPrefix}$_keyUserNickname';
  String get _avatarKey => '${keyPrefix}$_keyUserAvatar';
  String get _realNameVerifiedKey => '${keyPrefix}$_keyUserRealNameVerified';

  String? get cachedAccessToken => _cachedAccessToken;
  String? get cachedRefreshToken => _cachedRefreshToken;
  String? get cachedUserId => _cachedUserId;
  String? get cachedNickname => _cachedNickname;
  String? get cachedAvatar => _cachedAvatar;
  bool? get cachedIsRealNameVerified => _cachedIsRealNameVerified;
  bool get isCacheRestored => _cacheRestored;

  Stream<void> get onAuthError => _authErrorController.stream;

  /// Restore cache from secure storage on app startup.
  Future<void> restoreCache() async {
    try {
      final results = await Future.wait([
        _storage.read(key: _accessTokenKey),
        _storage.read(key: _refreshTokenKey),
        _storage.read(key: _userIdKey),
        _storage.read(key: _nicknameKey),
        _storage.read(key: _avatarKey),
        _storage.read(key: _realNameVerifiedKey),
      ]);
      _cachedAccessToken = results[0];
      _cachedRefreshToken = results[1];
      _cachedUserId = results[2];
      _cachedNickname = _normalizeOptionalString(results[3]);
      _cachedAvatar = _normalizeOptionalString(results[4]);
      final verifiedRaw = results[5];
      _cachedIsRealNameVerified =
          verifiedRaw == null ? null : verifiedRaw.toLowerCase() == 'true';
      _cacheRestored = true;
    } catch (_) {
      // Storage read failure; cache stays empty.
      _cacheRestored = false;
    }
  }

  Future<void> saveAccessToken(String token) async {
    await _storage.write(key: _accessTokenKey, value: token);
    _cachedAccessToken = token;
  }

  /// Internal save that silently catches storage errors.
  Future<void> _safeWrite(String key, String? value) async {
    try {
      if (value == null) {
        await _storage.delete(key: key);
      } else {
        await _storage.write(key: key, value: value);
      }
    } catch (_) {}
  }

  Future<String?> getAccessToken() async {
    if (_cachedAccessToken != null) return _cachedAccessToken;
    final token = await _storage.read(key: _accessTokenKey);
    _cachedAccessToken = token;
    return token;
  }

  Future<void> saveRefreshToken(String token) async {
    await _storage.write(key: _refreshTokenKey, value: token);
    _cachedRefreshToken = token;
  }

  /// Internal delete that silently catches storage errors.
  Future<void> _safeDelete(String key) async {
    try {
      await _storage.delete(key: key);
    } catch (_) {}
  }

  Future<String?> getRefreshToken() async {
    if (_cachedRefreshToken != null) return _cachedRefreshToken;
    final token = await _storage.read(key: _refreshTokenKey);
    _cachedRefreshToken = token;
    return token;
  }

  Future<void> saveUserId(String userId) async {
    await _storage.write(key: _userIdKey, value: userId);
    _cachedUserId = userId;
  }

  Future<String?> getUserId() async {
    if (_cachedUserId != null) return _cachedUserId;
    final userId = await _storage.read(key: _userIdKey);
    _cachedUserId = userId;
    return userId;
  }

  Future<void> saveUserProfileSnapshot({
    String? nickname,
    String? avatar,
    bool? isRealNameVerified,
  }) async {
    final normalizedNickname = _normalizeOptionalString(nickname);
    final normalizedAvatar = _normalizeOptionalString(avatar);

    await Future.wait([
      _safeWrite(
          _nicknameKey, normalizedNickname == null ? null : normalizedNickname),
      _safeWrite(
          _avatarKey, normalizedAvatar == null ? null : normalizedAvatar),
      _safeWrite(_realNameVerifiedKey,
          isRealNameVerified == null ? null : isRealNameVerified.toString()),
    ]);

    _cachedNickname = normalizedNickname;
    _cachedAvatar = normalizedAvatar;
    _cachedIsRealNameVerified = isRealNameVerified;
  }

  Future<({String? nickname, String? avatar, bool? isRealNameVerified})>
      getUserProfileSnapshot() async {
    final values = await Future.wait([
      _storage.read(key: _nicknameKey),
      _storage.read(key: _avatarKey),
      _storage.read(key: _realNameVerifiedKey),
    ]);

    final nickname = _normalizeOptionalString(values[0]);
    final avatar = _normalizeOptionalString(values[1]);
    final verifiedRaw = values[2];
    final isRealNameVerified =
        verifiedRaw == null ? null : verifiedRaw.toLowerCase() == 'true';

    return (
      nickname: nickname,
      avatar: avatar,
      isRealNameVerified: isRealNameVerified,
    );
  }

  Future<void> saveAuthTokens({
    required String accessToken,
    required String refreshToken,
    required String userId,
  }) async {
    await Future.wait([
      saveAccessToken(accessToken),
      saveRefreshToken(refreshToken),
      saveUserId(userId),
    ]);
  }

  Future<void> clearAll() async {
    await Future.wait([
      _safeDelete(_accessTokenKey),
      _safeDelete(_refreshTokenKey),
      _safeDelete(_userIdKey),
      _safeDelete(_nicknameKey),
      _safeDelete(_avatarKey),
      _safeDelete(_realNameVerifiedKey),
    ]);
    _cachedAccessToken = null;
    _cachedRefreshToken = null;
    _cachedUserId = null;
    _cachedNickname = null;
    _cachedAvatar = null;
    _cachedIsRealNameVerified = null;
    _cacheRestored = false;
  }

  Future<bool> hasAccessToken() async {
    final token = await getAccessToken();
    return token != null && token.isNotEmpty;
  }

  /// Force logout: clear all tokens and notify listeners.
  Future<void> forceLogout() async {
    try {
      await clearAll();
    } catch (_) {
      // Ensure notification fires even if storage clear fails.
      _cachedAccessToken = null;
      _cachedRefreshToken = null;
      _cachedUserId = null;
      _cachedNickname = null;
      _cachedAvatar = null;
      _cachedIsRealNameVerified = null;
      _cacheRestored = false;
    }
    if (!_authErrorController.isClosed) {
      _authErrorController.add(null);
    }
  }

  void dispose() {
    if (!_authErrorController.isClosed) {
      _authErrorController.close();
    }
  }

  String? _normalizeOptionalString(String? value) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) return null;
    return trimmed;
  }
}
