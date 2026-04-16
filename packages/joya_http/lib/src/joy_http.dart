import 'package:dio/dio.dart';
import 'package:joya_auth/joya_auth.dart';
import 'auth_interceptor.dart';

/// Factory for creating pre-configured Dio instances.
class JoyHttp {
  const JoyHttp._();

  /// Creates a [Dio] instance with optional auth interceptor.
  static Dio dio({
    String? baseUrl,
    TokenService? tokenService,
    String? refreshBaseUrl,
    Duration? timeout,
    Map<String, dynamic>? defaultHeaders,
  }) {
    final dio = Dio(BaseOptions(
      baseUrl: baseUrl ?? '',
      connectTimeout: timeout ?? const Duration(seconds: 10),
      receiveTimeout: timeout ?? const Duration(seconds: 10),
      sendTimeout: timeout ?? const Duration(seconds: 10),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        if (defaultHeaders != null) ...defaultHeaders,
      },
    ));

    if (tokenService != null && refreshBaseUrl != null) {
      dio.interceptors.add(
        AuthInterceptor(
          tokenService: tokenService,
          refreshBaseUrl: refreshBaseUrl,
          retryDio: dio,
        ),
      );
    }

    return dio;
  }
}
