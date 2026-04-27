import 'auth_user.dart';

/// Result of an auth API call.
class AuthResult {
  final bool success;
  final String message;
  final AuthUser? user;
  final String? accessToken;
  final String? refreshToken;

  const AuthResult({
    required this.success,
    required this.message,
    this.user,
    this.accessToken,
    this.refreshToken,
  });

  factory AuthResult.fromJson(Map<String, dynamic> json) {
    final data = json['data'] as Map<String, dynamic>?;
    AuthUser? user;
    String? accessToken;
    String? refreshToken;

    if (data != null) {
      final userData = data['user'] as Map<String, dynamic>?;
      if (userData != null) {
        user = AuthUser.fromJson(userData);
      }
      final tokens = data['tokens'] as Map<String, dynamic>?;
      if (tokens != null) {
        accessToken = tokens['accessToken'] as String?;
        refreshToken = tokens['refreshToken'] as String?;
      }
    }

    return AuthResult(
      success: json['success'] as bool? ?? false,
      message: json['message'] as String? ?? 'Unknown error',
      user: user,
      accessToken: accessToken,
      refreshToken: refreshToken,
    );
  }

  factory AuthResult.error(String message) {
    return AuthResult(success: false, message: message);
  }
}
