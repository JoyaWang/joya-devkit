/// Cloud user info returned from auth API.
class AuthUser {
  final String id;
  final String phone;
  final String createdAt;

  const AuthUser({
    required this.id,
    required this.phone,
    required this.createdAt,
  });

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String,
      phone: json['phone'] as String,
      createdAt: json['createdAt'] as String,
    );
  }
}
