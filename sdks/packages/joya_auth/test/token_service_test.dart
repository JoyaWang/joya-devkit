import 'package:flutter_test/flutter_test.dart';
import 'package:joya_auth/joya_auth.dart';

void main() {
  group('TokenService', () {
    late TokenService service;
    late InMemorySecureStorage storage;

    setUp(() {
      storage = InMemorySecureStorage();
      service = TokenService(storage: storage, keyPrefix: 'test_');
    });

    tearDown(() {
      service.dispose();
    });

    test('saveAccessToken writes to storage and cache', () async {
      await service.saveAccessToken('access123');
      expect(service.cachedAccessToken, 'access123');
      expect(await storage.read(key: 'test_auth_access_token'), 'access123');
    });

    test('getAccessToken returns cached value without reading storage', () async {
      await service.saveAccessToken('cached');
      await storage.deleteAll();
      expect(await service.getAccessToken(), 'cached');
    });

    test('saveRefreshToken writes to storage and cache', () async {
      await service.saveRefreshToken('refresh456');
      expect(service.cachedRefreshToken, 'refresh456');
      expect(await storage.read(key: 'test_auth_refresh_token'), 'refresh456');
    });

    test('getRefreshToken falls back to storage', () async {
      await storage.write(key: 'test_auth_refresh_token', value: 'from_storage');
      expect(await service.getRefreshToken(), 'from_storage');
      expect(service.cachedRefreshToken, 'from_storage');
    });

    test('saveUserId writes to storage and cache', () async {
      await service.saveUserId('user42');
      expect(service.cachedUserId, 'user42');
      expect(await storage.read(key: 'test_auth_user_id'), 'user42');
    });

    test('clearAll removes all keys and cache', () async {
      await service.saveAuthTokens(
        accessToken: 'a',
        refreshToken: 'r',
        userId: 'u',
      );
      await service.saveUserProfileSnapshot(
        nickname: 'nick',
        avatar: 'url',
        isRealNameVerified: true,
      );
      await service.clearAll();
      expect(service.cachedAccessToken, isNull);
      expect(service.cachedRefreshToken, isNull);
      expect(service.cachedUserId, isNull);
      expect(service.cachedNickname, isNull);
      expect(service.cachedAvatar, isNull);
      expect(service.cachedIsRealNameVerified, isNull);
      expect(await storage.read(key: 'test_auth_access_token'), isNull);
    });

    test('restoreCache reads all values from storage', () async {
      await storage.write(key: 'test_auth_access_token', value: 'acc');
      await storage.write(key: 'test_auth_refresh_token', value: 'ref');
      await storage.write(key: 'test_auth_user_id', value: 'uid');
      await storage.write(key: 'test_auth_user_nickname', value: 'nick');
      await storage.write(key: 'test_auth_user_avatar', value: 'ava');
      await storage.write(key: 'test_auth_user_real_name_verified', value: 'true');

      await service.restoreCache();
      expect(service.isCacheRestored, isTrue);
      expect(service.cachedAccessToken, 'acc');
      expect(service.cachedRefreshToken, 'ref');
      expect(service.cachedUserId, 'uid');
      expect(service.cachedNickname, 'nick');
      expect(service.cachedAvatar, 'ava');
      expect(service.cachedIsRealNameVerified, isTrue);
    });

    test('saveAuthTokens batch saves tokens', () async {
      await service.saveAuthTokens(
        accessToken: 'at',
        refreshToken: 'rt',
        userId: 'uid',
      );
      expect(service.cachedAccessToken, 'at');
      expect(service.cachedRefreshToken, 'rt');
      expect(service.cachedUserId, 'uid');
    });

    test('saveUserProfileSnapshot and getUserProfileSnapshot', () async {
      await service.saveUserProfileSnapshot(
        nickname: 'Joy',
        avatar: 'https://example.com/avatar.png',
        isRealNameVerified: false,
      );
      final profile = await service.getUserProfileSnapshot();
      expect(profile.nickname, 'Joy');
      expect(profile.avatar, 'https://example.com/avatar.png');
      expect(profile.isRealNameVerified, isFalse);
    });

    test('forceLogout clears everything and emits auth error', () async {
      await service.saveAccessToken('tok');
      var emitted = false;
      service.onAuthError.listen((_) => emitted = true);
      await service.forceLogout();
      expect(service.cachedAccessToken, isNull);
      await Future.delayed(const Duration(milliseconds: 10));
      expect(emitted, isTrue);
    });

    test('hasAccessToken returns true when token exists', () async {
      await service.saveAccessToken('token');
      expect(await service.hasAccessToken(), isTrue);
      await service.clearAll();
      expect(await service.hasAccessToken(), isFalse);
    });

    test('uses default joya_ prefix when not specified', () {
      final defaultService = TokenService(storage: storage);
      expect(defaultService.keyPrefix, 'joya_');
    });

    test('empty strings in profile are normalized to null', () async {
      await service.saveUserProfileSnapshot(nickname: '  ');
      expect(service.cachedNickname, isNull);
    });
  });
}
