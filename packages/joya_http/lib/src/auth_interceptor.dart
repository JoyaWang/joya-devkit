import 'dart:async';
import 'package:dio/dio.dart';
import 'package:joya_auth/joya_auth.dart';

/// Authentication interceptor that injects Bearer tokens and handles token refresh.
class AuthInterceptor extends QueuedInterceptor {
  final TokenService _tokenService;
  final Dio _refreshDio;
  final Dio? _retryDio;

  bool _isRefreshing = false;
  final List<_PendingRequest> _pendingRequests = [];

  AuthInterceptor({
    required TokenService tokenService,
    required String refreshBaseUrl,
    Dio? refreshDio,
    Dio? retryDio,
  })  : _tokenService = tokenService,
        _refreshDio = refreshDio ??
            Dio(BaseOptions(
              baseUrl: refreshBaseUrl,
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 10),
              sendTimeout: const Duration(seconds: 10),
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
              },
            )),
        _retryDio = retryDio;

  bool _shouldSkipAuth(RequestOptions options) {
    return options.extra['skipAuth'] == true;
  }

  @override
  void onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    try {
      if (_shouldSkipAuth(options)) {
        handler.next(options);
        return;
      }

      // Skip refresh-token endpoint to avoid loops.
      if (options.path.contains('/auth/refresh-token')) {
        handler.next(options);
        return;
      }

      // Skip if Authorization already present.
      if (options.headers.containsKey('Authorization')) {
        handler.next(options);
        return;
      }

      final token = await _tokenService.getAccessToken();
      if (token != null && token.isNotEmpty) {
        options.headers['Authorization'] = 'Bearer $token';
      }
    } catch (_) {
      // Ignore injection failures.
    }
    handler.next(options);
  }

  @override
  void onResponse(Response response, ResponseInterceptorHandler handler) {
    if (_shouldSkipAuth(response.requestOptions)) {
      handler.next(response);
      return;
    }

    final data = response.data;
    if (data is Map) {
      final errorCode = data['code'];
      final errorMsg = data['error']?.toString() ?? data['message']?.toString();
      final isTokenError = errorCode == 'INVALID_TOKEN' ||
          errorCode == 'UNAUTHORIZED' ||
          errorCode == 40101 ||
          errorCode == 40102 ||
          (errorMsg != null &&
              (errorMsg.contains('Invalid or expired token') ||
                  errorMsg.contains('Invalid token') ||
                  errorMsg.contains('expired token')));

      if (isTokenError) {
        final softErr = DioException(
          requestOptions: response.requestOptions,
          response: Response(
            requestOptions: response.requestOptions,
            statusCode: 401,
            statusMessage: 'Unauthorized (Soft 401)',
            data: response.data,
          ),
          type: DioExceptionType.badResponse,
          message: errorMsg ?? 'Invalid or expired token',
        );
        _handleUnauthorized(softErr).then((retryResponse) {
          if (retryResponse != null) {
            handler.resolve(retryResponse);
          } else {
            handler.next(response);
          }
        }).catchError((e, __) {
          handler.reject(e is DioException ? e : softErr);
        });
        return;
      }
    }

    handler.next(response);
  }

  @override
  void onError(DioException err, ErrorInterceptorHandler handler) async {
    if (_shouldSkipAuth(err.requestOptions)) {
      handler.next(err);
      return;
    }

    if (err.requestOptions.path.contains('/auth/refresh-token')) {
      handler.next(err);
      return;
    }

    if (err.response?.statusCode == 401) {
      try {
        final retryResponse = await _handleUnauthorized(err);
        if (retryResponse != null) {
          handler.resolve(retryResponse);
          return;
        }
      } catch (_) {
        // Already handled logout internally.
      }
    }

    handler.next(err);
  }

  Future<Response<dynamic>?> _handleUnauthorized(DioException err) async {
    final data = err.response?.data;
    final errorCode = data is Map ? data['code'] : null;
    final canRefresh = data is Map && data['canRefresh'] == true;

    final requestHadAuthHeader = err.requestOptions.headers.entries.any((entry) {
      if (entry.key.toLowerCase() != 'authorization') return false;
      final value = entry.value?.toString().trim();
      return value != null && value.isNotEmpty;
    });

    if (!requestHadAuthHeader) {
      throw err;
    }

    final accessToken = await _tokenService.getAccessToken();
    final refreshToken = await _tokenService.getRefreshToken();
    final hasAccessToken = accessToken != null && accessToken.isNotEmpty;
    final hasRefreshToken = refreshToken != null && refreshToken.isNotEmpty;

    if (!hasAccessToken && !hasRefreshToken) {
      throw err;
    }

    if (errorCode == 40102 || (errorCode == 40101 && canRefresh == false)) {
      await _tokenService.forceLogout();
      throw err;
    }

    if (!hasRefreshToken) {
      await _tokenService.forceLogout();
      throw err;
    }

    // If already refreshing, queue this request and wait.
    if (_isRefreshing) {
      final completer = Completer<Response<dynamic>?>();
      _pendingRequests.add(_PendingRequest(err, completer));
      return completer.future;
    }

    _isRefreshing = true;
    try {
      final response = await _refreshDio.post(
        '/auth/refresh-token',
        data: {'refresh_token': refreshToken},
      );

      if (response.statusCode == 200 || response.statusCode == 201) {
        final respData = response.data;
        final payload = respData is Map<String, dynamic>
            ? respData['data'] as Map<String, dynamic>?
            : null;
        final newAccessToken = payload?['access_token'] ?? payload?['token'];
        final newRefreshToken = payload?['refresh_token'];

        if (respData['success'] == true && newAccessToken != null) {
          final accessTokenStr = newAccessToken.toString();
          await _tokenService.saveAccessToken(accessTokenStr);
          if (newRefreshToken != null) {
            await _tokenService.saveRefreshToken(newRefreshToken.toString());
          }

          // Retry pending requests with new token.
          final tokenStr = newAccessToken.toString();
          await _flushPendingRequests(tokenStr);

          final opts = err.requestOptions;
          opts.headers['Authorization'] = 'Bearer $tokenStr';

          final retryDio = _retryDio ?? Dio(BaseOptions(
            baseUrl: opts.baseUrl,
            connectTimeout: opts.connectTimeout,
            receiveTimeout: opts.receiveTimeout,
            sendTimeout: opts.sendTimeout,
          ));

          return retryDio.request(
            opts.path,
            data: opts.data,
            queryParameters: opts.queryParameters,
            options: Options(
              method: opts.method,
              headers: opts.headers,
            ),
          );
        }
      }

      // Refresh failed — reject all pending.
      _rejectPendingRequests(err);
      await _tokenService.forceLogout();
      throw err;
    } on DioException {
      _rejectPendingRequests(err);
      await _tokenService.forceLogout();
      rethrow;
    } finally {
      _isRefreshing = false;
    }
  }

  Future<void> _flushPendingRequests(String newToken) async {
    final pending = List<_PendingRequest>.from(_pendingRequests);
    _pendingRequests.clear();

    for (final req in pending) {
      try {
        final opts = req.originalError.requestOptions;
        opts.headers['Authorization'] = 'Bearer $newToken';

        final retryDio = _retryDio ?? Dio(BaseOptions(
          baseUrl: opts.baseUrl,
          connectTimeout: opts.connectTimeout,
          receiveTimeout: opts.receiveTimeout,
          sendTimeout: opts.sendTimeout,
        ));

        final retryResponse = await retryDio.request(
          opts.path,
          data: opts.data,
          queryParameters: opts.queryParameters,
          options: Options(
            method: opts.method,
            headers: opts.headers,
          ),
        );
        req.completer.complete(retryResponse);
      } catch (e) {
        req.completer.completeError(e);
      }
    }
  }

  void _rejectPendingRequests(DioException err) {
    for (final req in _pendingRequests) {
      req.completer.completeError(err);
    }
    _pendingRequests.clear();
  }
}

class _PendingRequest {
  final DioException originalError;
  final Completer<Response<dynamic>?> completer;

  _PendingRequest(this.originalError, this.completer);
}
