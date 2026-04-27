import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/signin_kit_config.dart';
import '../models/auth_mode.dart';
import '../models/auth_result.dart';
import '../services/legal_service.dart';
import '../view_models/auth_state.dart';
import '../view_models/auth_view_model.dart';
import '../view_models/auth_view_model_provider.dart';
import 'agreement_checkbox.dart';
import 'login_agreement_hint.dart';

/// Complete authentication page — login / register / reset password.
///
/// Integrates with SRS auth API and legal document service.
/// [onAuthComplete] is called after successful auth with the result.
/// [onOpenLegalPage] is called when user taps a legal document link.
class AuthPage extends ConsumerStatefulWidget {
  final SigninKitConfig config;
  final AuthMode initialMode;
  final void Function(AuthResult result) onAuthComplete;
  final void Function({required String title, required String url})?
      onOpenLegalPage;

  const AuthPage({
    super.key,
    required this.config,
    this.initialMode = AuthMode.login,
    required this.onAuthComplete,
    this.onOpenLegalPage,
  });

  @override
  ConsumerState<AuthPage> createState() => _AuthPageState();
}

class _AuthPageState extends ConsumerState<AuthPage> {
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _confirmPasswordController = TextEditingController();
  final _verificationCodeController = TextEditingController();

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    _confirmPasswordController.dispose();
    _verificationCodeController.dispose();
    super.dispose();
  }

  late final LegalService _legalService = LegalService(
    srsBaseUrl: widget.config.srsBaseUrl,
    projectKey: widget.config.projectKey,
  );

  void _openLegalPage({required String title, required String url}) {
    if (widget.onOpenLegalPage != null) {
      // Build the actual URL based on document type.
      final actualUrl = title == '用户协议'
          ? _legalService.userAgreementUrl
          : _legalService.privacyPolicyUrl;
      widget.onOpenLegalPage!(title: title, url: actualUrl);
    }
  }

  @override
  Widget build(BuildContext context) {
    final provider = authViewModelProvider(widget.initialMode);
    final state = ref.watch(provider);
    final vm = ref.read(provider.notifier);
    final theme = Theme.of(context);

    ref.listen<AuthState>(provider, (prev, next) {
      if (next.isComplete && !(prev?.isComplete ?? false)) {
        _onAuthComplete(next);
      }
      if (next.errorMessage != null && next.errorMessage != prev?.errorMessage) {
        _showSnackBar(next.errorMessage!, isError: true);
      }
      if (next.successMessage != null &&
          next.successMessage != prev?.successMessage &&
          !next.isComplete) {
        _showSnackBar(next.successMessage!, isError: false);
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: Text(state.mode == AuthMode.register
            ? '注册云账号'
            : state.mode == AuthMode.login
                ? '登录云账号'
                : '重置密码'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Header
            if (state.mode != AuthMode.resetPassword) ...[
              _buildHeader(theme, state.mode),
              const SizedBox(height: 32),
            ] else
              const SizedBox(height: 16),

            // Phone field
            _buildPhoneField(theme, vm, state),
            const SizedBox(height: 16),

            // Verification code (reset only)
            if (state.mode == AuthMode.resetPassword) ...[
              _buildVerificationCodeField(theme, vm, state),
              const SizedBox(height: 16),
            ],

            // Password
            _buildPasswordField(theme, vm, state),
            const SizedBox(height: 16),

            // Confirm password (register/reset)
            if (state.mode == AuthMode.register ||
                state.mode == AuthMode.resetPassword) ...[
              _buildConfirmPasswordField(theme, vm, state),
              const SizedBox(height: 8),
              Text(
                state.mode == AuthMode.register
                    ? '密码长度 6-32 位，建议使用字母+数字组合'
                    : '请设置新的 6-32 位登录密码',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 16),
            ],

            // Agreement checkbox (register only)
            if (state.mode == AuthMode.register) ...[
              AgreementCheckbox(
                agreed: state.agreedToTerms,
                onChanged: vm.setAgreedToTerms,
                onOpenLegalPage: _openLegalPage,
              ),
              const SizedBox(height: 16),
            ],

            // Submit button
            _buildSubmitButton(theme, vm, state),
            const SizedBox(height: 16),

            // Mode toggle
            _buildModeToggle(theme, vm, state),

            // Login agreement hint (login only)
            if (state.mode == AuthMode.login) ...[
              const SizedBox(height: 16),
              LoginAgreementHint(
                onOpenLegalPage: _openLegalPage,
              ),
            ],
            const SizedBox(height: 24),
          ],
        ),
      ),
    );
  }

  Widget _buildHeader(ThemeData theme, AuthMode mode) {
    return Column(
      children: [
        Icon(
          mode == AuthMode.register ? Icons.cloud_outlined : Icons.login,
          size: 64,
          color: theme.colorScheme.primary,
        ),
        const SizedBox(height: 16),
        Text(
          mode == AuthMode.register
              ? '注册后数据将自动云端备份'
              : '登录后恢复您的云端数据',
          style: theme.textTheme.bodyLarge?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
          textAlign: TextAlign.center,
        ),
      ],
    );
  }

  Widget _buildPhoneField(
      ThemeData theme, AuthViewModel vm, AuthState state) {
    return TextField(
      controller: _phoneController,
      keyboardType: TextInputType.phone,
      maxLength: 11,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      decoration: InputDecoration(
        labelText: '手机号',
        hintText: '请输入11位手机号',
        prefixIcon: const Icon(Icons.phone_android),
        counterText: '',
        border: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
        ),
        errorText: state.phone.isNotEmpty && !state.isPhoneValid
            ? '请输入有效的手机号'
            : null,
      ),
      onChanged: (value) => vm.setPhone(value),
      enabled: !state.isLoading,
    );
  }

  Widget _buildVerificationCodeField(
      ThemeData theme, AuthViewModel vm, AuthState state) {
    return TextField(
      controller: _verificationCodeController,
      keyboardType: TextInputType.number,
      maxLength: 6,
      inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      decoration: InputDecoration(
        labelText: '验证码',
        hintText: '6位数字',
        prefixIcon: const Icon(Icons.verified_user_outlined),
        counterText: '',
        border: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
        ),
        suffixIcon: Padding(
          padding: const EdgeInsets.only(right: 8.0, top: 4, bottom: 4),
          child: TextButton(
            onPressed:
                state.isPhoneValid && !state.isLoading ? () => vm.sendCode() : null,
            style: TextButton.styleFrom(
              padding: const EdgeInsets.symmetric(horizontal: 16),
            ),
            child: Text(
              state.isCodeSent ? '重新获取' : '获取验证码',
              style: const TextStyle(fontWeight: FontWeight.bold),
            ),
          ),
        ),
      ),
      onChanged: (value) => vm.setVerificationCode(value),
      enabled: !state.isLoading,
    );
  }

  Widget _buildPasswordField(
      ThemeData theme, AuthViewModel vm, AuthState state) {
    return TextField(
      controller: _passwordController,
      obscureText: true,
      maxLength: 32,
      decoration: InputDecoration(
        labelText: state.mode == AuthMode.register
            ? '设置密码'
            : state.mode == AuthMode.login
                ? '输入密码'
                : '新密码',
        hintText: '6-32位密码',
        prefixIcon: const Icon(Icons.lock_outline),
        counterText: '',
        border: const OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
        ),
        errorText: state.password != null && state.password!.isEmpty
            ? '请输入密码'
            : null,
      ),
      onChanged: (value) => vm.setPassword(value.isEmpty ? null : value),
      enabled: !state.isLoading,
    );
  }

  Widget _buildConfirmPasswordField(
      ThemeData theme, AuthViewModel vm, AuthState state) {
    return TextField(
      controller: _confirmPasswordController,
      obscureText: true,
      maxLength: 32,
      decoration: const InputDecoration(
        labelText: '确认密码',
        hintText: '再次输入密码',
        prefixIcon: Icon(Icons.lock_outline),
        counterText: '',
        border: OutlineInputBorder(
          borderRadius: BorderRadius.all(Radius.circular(8)),
        ),
      ),
      onChanged: (value) => vm.setConfirmPassword(value),
    );
  }

  Widget _buildSubmitButton(
      ThemeData theme, AuthViewModel vm, AuthState state) {
    return SizedBox(
      height: 48,
      child: FilledButton(
        onPressed: state.canSubmit ? () => vm.submit() : null,
        style: FilledButton.styleFrom(
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
        child: state.isLoading
            ? const SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              )
            : Text(
                state.mode == AuthMode.register
                    ? '注册'
                    : state.mode == AuthMode.login
                        ? '登录'
                        : '确认重置',
                style: const TextStyle(fontSize: 16),
              ),
      ),
    );
  }

  Widget _buildModeToggle(
      ThemeData theme, AuthViewModel vm, AuthState state) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Text(
          state.mode == AuthMode.register ? '已有账号？' : '没有账号？',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        TextButton(
          onPressed: state.isLoading
              ? null
              : () {
                  if (state.mode == AuthMode.resetPassword) {
                    vm.setMode(AuthMode.login);
                  } else {
                    vm.setMode(
                      state.mode == AuthMode.register
                          ? AuthMode.login
                          : AuthMode.register,
                    );
                  }
                },
          child: Text(state.mode == AuthMode.register
              ? '去登录'
              : state.mode == AuthMode.login
                  ? '去注册'
                  : '返回登录'),
        ),
        if (state.mode == AuthMode.login) ...[
          const Spacer(),
          TextButton(
            onPressed: state.isLoading
                ? null
                : () => vm.setMode(AuthMode.resetPassword),
            child: const Text('忘记密码？'),
          ),
        ],
      ],
    );
  }

  void _onAuthComplete(AuthState state) {
    if (!mounted) return;
    final result = AuthResult(
      success: true,
      message: state.successMessage ?? '操作成功',
    );
    widget.onAuthComplete(result);
  }

  void _showSnackBar(String message, {required bool isError}) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: isError ? Colors.red : Colors.green,
      ),
    );
  }
}
