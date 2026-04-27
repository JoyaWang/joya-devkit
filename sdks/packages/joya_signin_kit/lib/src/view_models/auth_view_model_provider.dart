import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:joya_auth/joya_auth.dart';

import '../config/signin_kit_config.dart';
import '../models/auth_mode.dart';
import '../services/auth_api_client.dart';
import 'auth_state.dart';
import 'auth_view_model.dart';

/// Provider for SigninKitConfig (must be overridden by the integrating app).
final signinKitConfigProvider = Provider<SigninKitConfig>((ref) {
  throw StateError('signinKitConfigProvider must be overridden');
});

/// Provider for AuthApiClient.
final authApiClientProvider = Provider<AuthApiClient>((ref) {
  final config = ref.watch(signinKitConfigProvider);
  return AuthApiClient(
    srsBaseUrl: config.srsBaseUrl,
    projectKey: config.projectKey,
  );
});

/// Provider for TokenService.
final authTokenServiceProvider = Provider<TokenService>((ref) {
  final config = ref.watch(signinKitConfigProvider);
  return TokenService(keyPrefix: config.keyPrefix);
});

/// Provider for AuthViewModel (auto-dispose, family by initial mode).
final authViewModelProvider = StateNotifierProvider.autoDispose
    .family<AuthViewModel, AuthState, AuthMode>((ref, initialMode) {
  return AuthViewModel(
    apiClient: ref.watch(authApiClientProvider),
    tokenService: ref.watch(authTokenServiceProvider),
    initialMode: initialMode,
  );
});
