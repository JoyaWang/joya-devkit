import 'package:flutter_test/flutter_test.dart';
import 'package:joya_http/joya_http.dart';

void main() {
  group('ApiResponse', () {
    test('fromJson parses success response', () {
      final json = {
        'success': true,
        'message': 'ok',
        'data': {'name': 'Joya'},
        'code': 0,
      };
      final response = ApiResponse.fromJson(
        json,
        (data) => (data as Map)['name'] as String,
      );
      expect(response.success, isTrue);
      expect(response.message, 'ok');
      expect(response.data, 'Joya');
      expect(response.code, 0);
    });

    test('fromJson handles null data', () {
      final json = {
        'success': false,
        'message': 'error',
        'code': 401,
      };
      final response = ApiResponse<int>.fromJson(
        json,
        (data) => data as int,
      );
      expect(response.success, isFalse);
      expect(response.data, isNull);
      expect(response.code, 401);
    });

    test('toJson serializes correctly', () {
      const response = ApiResponse<int>(
        success: true,
        message: 'done',
        data: 42,
        code: 0,
      );
      final json = response.toJson();
      expect(json['success'], isTrue);
      expect(json['data'], 42);
    });
  });

  group('ApiErrorCodes', () {
    test('contains expected constants', () {
      expect(ApiErrorCodes.success, 0);
      expect(ApiErrorCodes.unauthorized, 401);
      expect(ApiErrorCodes.serverError, -3);
    });
  });

  group('ApiErrorMessages', () {
    test('contains expected messages', () {
      expect(ApiErrorMessages.unauthorized, '登录已过期，请重新登录');
      expect(ApiErrorMessages.networkError, '网络连接失败，请检查网络设置');
    });
  });
}
