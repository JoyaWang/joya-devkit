/// Configuration for JoyaSigninKit.
///
/// Pass [srsBaseUrl], [projectKey], [appName] and [keyPrefix] when integrating.
/// The kit connects directly to SRS for both auth API and legal document API.
class SigninKitConfig {
  /// SRS base URL (e.g. https://srs.infinex.cn).
  final String srsBaseUrl;

  /// Project identifier used for data isolation (e.g. "infov", "laicai").
  final String projectKey;

  /// App display name shown in UI and legal documents.
  final String appName;

  /// Key prefix for TokenService secure storage (e.g. "infov_").
  final String keyPrefix;

  /// Optional Dio base headers.
  final Map<String, dynamic> defaultHeaders;

  const SigninKitConfig({
    required this.srsBaseUrl,
    required this.projectKey,
    required this.appName,
    this.keyPrefix = 'joya_',
    this.defaultHeaders = const {},
  });
}
