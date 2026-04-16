# joya_http

Dio factory, auth interceptor and API response wrappers for Joya Flutter kits.

## Usage

```dart
import 'package:joya_http/joya_http.dart';
import 'package:joya_auth/joya_auth.dart';

final tokenService = TokenService();

final dio = JoyHttp.dio(
  baseUrl: 'https://api.example.com',
  tokenService: tokenService,
  refreshBaseUrl: 'https://api.example.com',
);

// Skip auth for specific request
final response = await dio.get(
  '/public/data',
  options: Options(extra: {'skipAuth': true}),
);
```

## API Response

```dart
final apiResp = ApiResponse<Map<String, dynamic>>.fromJson(
  json,
  (data) => data as Map<String, dynamic>,
);

if (apiResp.success) {
  print(apiResp.data);
}
```

## Features

- `JoyHttp.dio()` factory with configurable base URL and timeout
- `AuthInterceptor` automatically injects Bearer tokens
- Soft-401 detection (HTTP 200 with token error code in body)
- Automatic token refresh with original request retry
- `skipAuth` option to bypass authentication
- `ApiResponse<T>` wrapper with `success`, `data`, `message`, `code`
- `ApiErrorCodes` and `ApiErrorMessages` constants
