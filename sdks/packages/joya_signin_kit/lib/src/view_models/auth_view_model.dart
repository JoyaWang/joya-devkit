import 'package:flutter/foundation.dart' show debugPrint, kDebugMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:joya_auth/joya_auth.dart';

import '../models/auth_mode.dart';
import '../models/auth_result.dart';
import '../services/auth_api_client.dart';
import 'auth_state.dart';

/// Auth ViewModel — manages form state and submits to SRS auth API.
class AuthViewModel extends StateNotifier<AuthState> {
  final AuthApiClient _apiClient;
  final TokenService _tokenService;

  AuthViewModel({
    required AuthApiClient apiClient,
    required TokenService tokenService,
    AuthMode initialMode = AuthMode.login,
  })  : _apiClient = apiClient,
        _tokenService = tokenService,
        super(AuthState(mode: initialMode));

  // ── State Setters ───────────────────────────

  void setMode(AuthMode mode) {
    state = state.copyWith(mode: mode);
  }

  void setPhone(String phone) {
    state = state.copyWith(phone: phone, errorMessage: null);
  }

  void setPassword(String? password) {
    state = state.copyWith(password: password, errorMessage: null);
  }

  void setConfirmPassword(String? confirmPassword) {
    state = state.copyWith(confirmPassword: confirmPassword, errorMessage: null);
  }

  void setVerificationCode(String? code) {
    state = state.copyWith(verificationCode: code, errorMessage: null);
  }

  void setAgreedToTerms(bool agreed) {
    state = state.copyWith(agreedToTerms: agreed);
  }

  void clearError() {
    state = state.copyWith(errorMessage: null);
  }

  // ── Actions ─────────────────────────────────

  /// Submit the form (register, login, or reset password).
  Future<void> submit() async {
    if (!state.canSubmit) {
      if (!state.isPhoneValid) {
        state = state.copyWith(errorMessage: '请输入有效的手机号');
        return;
      }
      if (!state.isPasswordValid) {
        state = state.copyWith(errorMessage: '密码长度需要 6-32 位');
        return;
      }
      if (state.mode == AuthMode.register && !state.isConfirmPasswordValid) {
        state = state.copyWith(errorMessage: '两次输入的密码不一致');
        return;
      }
      if (state.mode == AuthMode.register && !state.agreedToTerms) {
        state = state.copyWith(errorMessage: '请先同意用户协议和隐私政策');
        return;
      }
      return;
    }

    state = state.copyWith(isLoading: true, errorMessage: null);

    final AuthResult result;

    if (state.mode == AuthMode.register) {
      result = await _apiClient.register(
        phone: state.phone,
        password: state.password!,
      );
    } else if (state.mode == AuthMode.login) {
      result = await _apiClient.login(
        phone: state.phone,
        password: state.password!,
      );
    } else {
      result = await _apiClient.resetPassword(
        phone: state.phone,
        code: state.verificationCode!,
        newPassword: state.password!,
      );
    }

    if (result.success) {
      // Save tokens via joya_auth TokenService.
      if (result.accessToken != null && result.refreshToken != null) {
        await _tokenService.saveAuthTokens(
          accessToken: result.accessToken!,
          refreshToken: result.refreshToken!,
          userId: result.user?.id ?? '',
        );
      }
      state = state.copyWith(
        isLoading: false,
        isComplete: true,
        successMessage: result.message,
      );
    } else {
      state = state.copyWith(
        isLoading: false,
        errorMessage: _translateError(result.message),
      );
    }
  }

  /// Send verification code.
  Future<void> sendCode() async {
    if (!state.isPhoneValid) {
      state = state.copyWith(errorMessage: '请输入有效的手机号');
      return;
    }

    state = state.copyWith(isLoading: true, errorMessage: null);

    final result = await _apiClient.sendCode(phone: state.phone);

    if (result.success) {
      state = state.copyWith(
        isLoading: false,
        isCodeSent: true,
        successMessage: result.message,
      );
    } else {
      state = state.copyWith(
        isLoading: false,
        errorMessage: _translateError(result.message),
      );
    }
  }

  /// Translate English API error messages to Chinese.
  String _translateError(String message) {
    final translations = {
      'Phone number already registered': '该手机号已注册',
      'User not found. Please register first.': '用户不存在，请先注册',
      'Invalid verification code': '验证码错误',
      'Verification code expired. Please request a new one.':
          '验证码已过期，请重新获取',
      'Too many attempts. Please request a new code.':
          '尝试次数过多，请重新获取验证码',
      'Invalid password': '密码错误',
      'Password not set. Please use verification code.':
          '未设置密码，请使用验证码登录',
      'Either code or password is required': '请输入验证码或密码',
      'Unable to connect to server. Please check your network.':
          '无法连接服务器，请检查网络',
      'Request timed out. Please try again.': '请求超时，请重试',
    };

    for (final entry in translations.entries) {
      if (message.contains(entry.key)) {
        return entry.value;
      }
    }

    if (kDebugMode) {
      debugPrint('[SigninKit] Untranslated error: $message');
    }
    return '操作失败，请稍后重试';
  }
}
