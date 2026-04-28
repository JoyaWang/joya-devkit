import 'package:dio/dio.dart';

import '../models/auth_result.dart';

/// API client for SRS auth endpoints.
///
/// All requests include `X-Project-Key` header for project isolation.
class AuthApiClient {
  final Dio _dio;
  final String projectKey;

  AuthApiClient({
    required String srsBaseUrl,
    required this.projectKey,
    Duration timeout = const Duration(seconds: 10),
  }) : _dio = Dio(BaseOptions(
          baseUrl: srsBaseUrl,
          connectTimeout: timeout,
          receiveTimeout: timeout,
          sendTimeout: timeout,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Project-Key': projectKey,
          },
        ));

  Future<AuthResult> register({
    required String phone,
    required String password,
  }) async {
    try {
      final response = await _dio.post(
        '/v1/auth/register',
        data: {'phone': phone, 'password': password},
        options: Options(extra: {'skipAuth': true}),
      );
      return AuthResult.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      return AuthResult.error(_translateDioError(e));
    }
  }

  Future<AuthResult> login({
    required String phone,
    required String password,
  }) async {
    try {
      final response = await _dio.post(
        '/v1/auth/login',
        data: {'phone': phone, 'password': password},
        options: Options(extra: {'skipAuth': true}),
      );
      return AuthResult.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      return AuthResult.error(_translateDioError(e));
    }
  }

  Future<AuthResult> sendCode({required String phone}) async {
    try {
      final response = await _dio.post(
        '/v1/auth/send-code',
        data: {'phone': phone},
        options: Options(extra: {'skipAuth': true}),
      );
      return AuthResult.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      return AuthResult.error(_translateDioError(e));
    }
  }

  Future<AuthResult> resetPassword({
    required String phone,
    required String code,
    required String newPassword,
  }) async {
    try {
      final response = await _dio.post(
        '/v1/auth/reset-password',
        data: {'phone': phone, 'code': code, 'newPassword': newPassword},
        options: Options(extra: {'skipAuth': true}),
      );
      return AuthResult.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      return AuthResult.error(_translateDioError(e));
    }
  }

  Future<AuthResult> refreshToken(String refreshToken) async {
    try {
      final response = await _dio.post(
        '/v1/auth/refresh',
        data: {'refreshToken': refreshToken},
        options: Options(extra: {'skipAuth': true}),
      );
      return AuthResult.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      return AuthResult.error(_translateDioError(e));
    }
  }

  Future<AuthResult> deleteAccount({
    required String password,
    required String accessToken,
  }) async {
    try {
      final response = await _dio.delete(
        '/v1/auth/account',
        data: {'password': password},
        options: Options(
          extra: {'skipAuth': true},
          headers: {'Authorization': 'Bearer $accessToken'},
        ),
      );
      return AuthResult.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      return AuthResult.error(_translateDioError(e));
    }
  }

  Future<AuthResult> me(String accessToken) async {
    try {
      final response = await _dio.get(
        '/v1/auth/me',
        options: Options(
          extra: {'skipAuth': true},
          headers: {'Authorization': 'Bearer $accessToken'},
        ),
      );
      return AuthResult.fromJson(response.data as Map<String, dynamic>);
    } on DioException catch (e) {
      return AuthResult.error(_translateDioError(e));
    }
  }

  String _translateDioError(DioException e) {
    if (e.response?.data is Map) {
      final data = e.response!.data as Map;
      final msg = (data['message'] ?? data['error']) as String?;
      if (msg != null && msg.isNotEmpty) return msg;
    }
    switch (e.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Request timed out. Please try again.';
      case DioExceptionType.connectionError:
        return 'Unable to connect to server. Please check your network.';
      default:
        return 'Operation failed. Please try again later.';
    }
  }
}
