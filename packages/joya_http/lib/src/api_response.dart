/// API response wrapper.
class ApiResponse<T> {
  final bool success;
  final String message;
  final T? data;
  final int? code;

  const ApiResponse({
    required this.success,
    required this.message,
    this.data,
    this.code,
  });

  factory ApiResponse.fromJson(
    Map<String, dynamic> json,
    T Function(dynamic) fromJsonT,
  ) {
    return ApiResponse(
      success: json['success'] == true,
      message: json['message']?.toString() ?? '',
      data: json['data'] != null ? fromJsonT(json['data']) : null,
      code: json['code'] as int?,
    );
  }

  Map<String, dynamic> toJson() => {
        'success': success,
        'message': message,
        'data': data,
        'code': code,
      };

  @override
  String toString() =>
      'ApiResponse(success: $success, code: $code, message: $message, data: $data)';
}
