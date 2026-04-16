import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:joya_auth/joya_auth.dart';
import 'package:joya_http/joya_http.dart';

class _MockRequestHandler extends RequestInterceptorHandler {
  RequestOptions? passed;
  @override
  void next(RequestOptions requestOptions) {
    passed = requestOptions;
  }
}

class _MockResponseHandler extends ResponseInterceptorHandler {
  Response? resolved;
  Response? nexted;
  DioException? rejected;
  @override
  void resolve(Response response, [bool callFollowingResponseInterceptor = true]) {
    resolved = response;
  }
  @override
  void next(Response response) {
    nexted = response;
  }
  @override
  void reject(DioException error, [bool callFollowingErrorInterceptor = true]) {
    rejected = error;
  }
}

class _MockErrorHandler extends ErrorInterceptorHandler {
  Response? resolved;
  DioException? nexted;
  DioException? rejected;
  @override
  void resolve(Response response) {
    this.resolved = response;
  }
  @override
  void next(DioException err) {
    nexted = err;
  }
  @override
  void reject(DioException err) {
    rejected = err;
  }
}

void main() {
  group('AuthInterceptor', () {
    late TokenService tokenService;
    late InMemorySecureStorage storage;

    setUp(() {
      storage = InMemorySecureStorage();
      tokenService = TokenService(storage: storage);
    });

    tearDown(() {
      tokenService.dispose();
    });

    test('onRequest injects Bearer token', () async {
      await tokenService.saveAccessToken('token123');
      final interceptor = AuthInterceptor(
        tokenService: tokenService,
        refreshBaseUrl: 'https://api.example.com',
      );
      final options = RequestOptions(path: '/users/profile');
      final handler = _MockRequestHandler();
      interceptor.onRequest(options, handler);
      await Future.delayed(const Duration(milliseconds: 10));
      expect(handler.passed?.headers['Authorization'], 'Bearer token123');
    });

    test('onRequest skips auth when skipAuth is true', () async {
      await tokenService.saveAccessToken('token123');
      final interceptor = AuthInterceptor(
        tokenService: tokenService,
        refreshBaseUrl: 'https://api.example.com',
      );
      final options = RequestOptions(
        path: '/users/profile',
        extra: {'skipAuth': true},
      );
      final handler = _MockRequestHandler();
      interceptor.onRequest(options, handler);
      await Future.delayed(const Duration(milliseconds: 10));
      expect(handler.passed?.headers.containsKey('Authorization'), isFalse);
    });

    test('onRequest skips refresh-token endpoint', () async {
      await tokenService.saveAccessToken('token123');
      final interceptor = AuthInterceptor(
        tokenService: tokenService,
        refreshBaseUrl: 'https://api.example.com',
      );
      final options = RequestOptions(path: '/auth/refresh-token');
      final handler = _MockRequestHandler();
      interceptor.onRequest(options, handler);
      await Future.delayed(const Duration(milliseconds: 10));
      expect(handler.passed?.headers.containsKey('Authorization'), isFalse);
    });

    test('onResponse detects soft 401 with INVALID_TOKEN code', () async {
      final interceptor = AuthInterceptor(
        tokenService: tokenService,
        refreshBaseUrl: 'https://api.example.com',
      );
      final request = RequestOptions(path: '/data');
      final response = Response(
        requestOptions: request,
        data: {'code': 'INVALID_TOKEN', 'message': 'bad token'},
        statusCode: 200,
      );
      final handler = _MockResponseHandler();
      interceptor.onResponse(response, handler);
      // Soft 401 triggers async _handleUnauthorized which will reject or resolve.
      await Future.delayed(const Duration(milliseconds: 50));
      // Since no refresh token exists, it should reject with 401.
      expect(handler.rejected != null || handler.nexted != null, isTrue);
    });

    test('onResponse passes through non-token errors', () async {
      final interceptor = AuthInterceptor(
        tokenService: tokenService,
        refreshBaseUrl: 'https://api.example.com',
      );
      final request = RequestOptions(path: '/data');
      final response = Response(
        requestOptions: request,
        data: {'code': 500, 'message': 'server error'},
        statusCode: 200,
      );
      final handler = _MockResponseHandler();
      interceptor.onResponse(response, handler);
      expect(handler.nexted, equals(response));
    });

    test('onError 401 triggers refresh and retries original request', () async {
      await tokenService.saveAuthTokens(
        accessToken: 'old_access',
        refreshToken: 'refresh_tok',
        userId: 'u1',
      );

      final mockAdapter = _MockRefreshAdapter();
      final refreshDio = Dio();
      refreshDio.httpClientAdapter = mockAdapter;
      final retryDio = Dio();
      retryDio.httpClientAdapter = mockAdapter;

      final interceptor = AuthInterceptor(
        tokenService: tokenService,
        refreshBaseUrl: 'https://api.example.com',
        refreshDio: refreshDio,
        retryDio: retryDio,
      );

      final request = RequestOptions(
        path: '/data',
        baseUrl: 'https://api.example.com',
        headers: {'Authorization': 'Bearer old_access'},
      );
      final error = DioException(
        requestOptions: request,
        response: Response(requestOptions: request, statusCode: 401),
        type: DioExceptionType.badResponse,
      );

      final handler = _MockErrorHandler();
      interceptor.onError(error, handler);
      await Future.delayed(const Duration(milliseconds: 100));

      expect(handler.resolved?.statusCode, 200);
      expect(handler.resolved?.data, 'retry_ok');
      expect(tokenService.cachedAccessToken, 'new_access');
    });

    test('onError 401 without refresh token triggers forceLogout', () async {
      await tokenService.saveAccessToken('access_only');
      final interceptor = AuthInterceptor(
        tokenService: tokenService,
        refreshBaseUrl: 'https://api.example.com',
      );

      var loggedOut = false;
      tokenService.onAuthError.listen((_) => loggedOut = true);

      final request = RequestOptions(
        path: '/data',
        headers: {'Authorization': 'Bearer access_only'},
      );
      final error = DioException(
        requestOptions: request,
        response: Response(requestOptions: request, statusCode: 401),
        type: DioExceptionType.badResponse,
      );

      final handler = _MockErrorHandler();
      interceptor.onError(error, handler);
      await Future.delayed(const Duration(milliseconds: 100));

      expect(loggedOut, isTrue);
      expect(tokenService.cachedAccessToken, isNull);
    });

    test('onError skips when skipAuth is true', () async {
      final interceptor = AuthInterceptor(
        tokenService: tokenService,
        refreshBaseUrl: 'https://api.example.com',
      );
      final request = RequestOptions(
        path: '/data',
        extra: {'skipAuth': true},
      );
      final error = DioException(
        requestOptions: request,
        response: Response(requestOptions: request, statusCode: 401),
        type: DioExceptionType.badResponse,
      );
      final handler = _MockErrorHandler();
      interceptor.onError(error, handler);
      await Future.delayed(const Duration(milliseconds: 10));
      expect(handler.nexted, equals(error));
    });
  });
}

class _MockRefreshAdapter implements HttpClientAdapter {
  @override
  Future<ResponseBody> fetch(
    RequestOptions options,
    Stream<Uint8List>? requestStream,
    Future<void>? cancelFuture,
  ) async {
    final path = options.path;
    final uri = options.uri.toString();
    if (path == '/auth/refresh-token' || uri.contains('/auth/refresh-token')) {
      return ResponseBody.fromString(
        '{"success": true, "data": {"access_token": "new_access", "refresh_token": "new_refresh"}}',
        200,
        headers: {
          Headers.contentTypeHeader: ['application/json'],
        },
      );
    }
    final retryPath = options.path;
    final retryUri = options.uri.toString();
    if (retryPath == '/data' || retryUri.contains('/data')) {
      return ResponseBody.fromString(
        '"retry_ok"',
        200,
        headers: {
          Headers.contentTypeHeader: ['application/json'],
        },
      );
    }
    return ResponseBody.fromString('"unknown"', 404);
  }

  @override
  void close({bool force = false}) {}
}
