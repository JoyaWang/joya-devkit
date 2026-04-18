import 'package:dio/dio.dart';
import 'package:joya_http/joya_http.dart';
import 'models/app_version_response.dart';

/// API client for version checking.
class VersionApiClient {
  final Dio _dio;

  VersionApiClient({required Dio dio}) : _dio = dio;

  Future<ApiResponse<AppVersionResponse>> checkAppVersion({
    required String platform,
    required String currentVersion,
    required String channel,
    required String deviceId,
  }) async {
    final response = await _dio.get(
      '/app-version',
      queryParameters: {
        'platform': platform,
        'currentVersion': currentVersion,
        'channel': channel,
        'deviceId': deviceId,
      },
      options: Options(extra: {'skipAuth': true}),
    );

    final data = response.data;
    if (data is Map<String, dynamic>) {
      return ApiResponse.fromJson(
        data,
        (json) => AppVersionResponse.fromJson(json as Map<String, dynamic>),
      );
    }

    return const ApiResponse(
      success: false,
      message: 'Invalid response format',
      code: -1,
    );
  }
}
