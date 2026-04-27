import '../models/auth_mode.dart';

/// Authentication form state.
class AuthState {
  final AuthMode mode;
  final String phone;
  final String? password;
  final String? confirmPassword;
  final String? verificationCode;
  final bool isLoading;
  final String? errorMessage;
  final String? successMessage;
  final bool isComplete;
  final bool isCodeSent;
  final bool agreedToTerms;

  const AuthState({
    this.mode = AuthMode.login,
    this.phone = '',
    this.password,
    this.confirmPassword,
    this.verificationCode,
    this.isLoading = false,
    this.errorMessage,
    this.successMessage,
    this.isComplete = false,
    this.isCodeSent = false,
    this.agreedToTerms = false,
  });

  AuthState copyWith({
    AuthMode? mode,
    String? phone,
    String? password,
    String? confirmPassword,
    String? verificationCode,
    bool? isLoading,
    String? errorMessage,
    String? successMessage,
    bool? isComplete,
    bool? isCodeSent,
    bool? agreedToTerms,
  }) {
    return AuthState(
      mode: mode ?? this.mode,
      phone: phone ?? this.phone,
      password: password ?? this.password,
      confirmPassword: confirmPassword ?? this.confirmPassword,
      verificationCode: verificationCode ?? this.verificationCode,
      isLoading: isLoading ?? this.isLoading,
      errorMessage: errorMessage,
      successMessage: successMessage,
      isComplete: isComplete ?? this.isComplete,
      isCodeSent: isCodeSent ?? this.isCodeSent,
      agreedToTerms: agreedToTerms ?? this.agreedToTerms,
    );
  }

  /// Phone number is valid (China mainland 11 digits).
  bool get isPhoneValid => RegExp(r'^1[3-9]\d{9}$').hasMatch(phone);

  /// Password is valid (6-32 characters).
  bool get isPasswordValid =>
      password != null && password!.length >= 6 && password!.length <= 32;

  /// Passwords match (register or reset mode).
  bool get isConfirmPasswordValid => password == confirmPassword;

  /// Verification code is present.
  bool get isVerificationCodeValid =>
      verificationCode != null && verificationCode!.isNotEmpty;

  /// Can submit the form.
  bool get canSubmit {
    if (!isPhoneValid || !isPasswordValid || isLoading) return false;
    // Register mode requires agreement to terms.
    if (mode == AuthMode.register && !agreedToTerms) return false;
    // Register or reset mode needs confirm password.
    if (mode == AuthMode.register || mode == AuthMode.resetPassword) {
      if (!isConfirmPasswordValid) return false;
    }
    // Reset mode needs verification code.
    if (mode == AuthMode.resetPassword) {
      return isVerificationCodeValid;
    }
    return true;
  }
}
