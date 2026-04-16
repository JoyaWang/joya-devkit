# joya_auth

Token secure storage and in-memory cache for Joya Flutter kits.

## Usage

```dart
import 'package:joya_auth/joya_auth.dart';

final tokenService = TokenService();

// On app startup
await tokenService.restoreCache();

// Save tokens
await tokenService.saveAuthTokens(
  accessToken: 'access_123',
  refreshToken: 'refresh_456',
  userId: 'user_42',
);

// Sync access cached token
final token = tokenService.cachedAccessToken;

// Save profile snapshot
await tokenService.saveUserProfileSnapshot(
  nickname: 'Joya',
  avatar: 'https://example.com/avatar.png',
  isRealNameVerified: true,
);

// Force logout
await tokenService.forceLogout();

// Listen to auth errors
tokenService.onAuthError.listen((_) {
  // Navigate to login page
});
```

## Testing

Use `InMemorySecureStorage` for unit tests:

```dart
final storage = InMemorySecureStorage();
final service = TokenService(storage: storage);
```
