/// Service for generating legal document URLs.
///
/// URLs include `?projectKey=xxx` query parameter so WebView can open them
/// without custom headers.
class LegalService {
  final String srsBaseUrl;
  final String projectKey;

  const LegalService({
    required this.srsBaseUrl,
    required this.projectKey,
  });

  /// Full URL to the user agreement page (WebView-ready).
  String get userAgreementUrl =>
      '$srsBaseUrl/v1/legal/user-agreement?projectKey=$projectKey';

  /// Full URL to the privacy policy page (WebView-ready).
  String get privacyPolicyUrl =>
      '$srsBaseUrl/v1/legal/privacy-policy?projectKey=$projectKey';
}
