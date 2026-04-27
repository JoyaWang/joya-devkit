import 'package:flutter/material.dart';

/// Login agreement hint — shows links to legal documents without blocking login.
class LoginAgreementHint extends StatelessWidget {
  final void Function({required String title, required String url})
      onOpenLegalPage;
  final String userAgreementLabel;
  final String privacyPolicyLabel;

  const LoginAgreementHint({
    super.key,
    required this.onOpenLegalPage,
    this.userAgreementLabel = '《用户协议》',
    this.privacyPolicyLabel = '《隐私政策》',
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: Text.rich(
        TextSpan(
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
          children: [
            const TextSpan(text: '登录即表示同意'),
            WidgetSpan(
              child: GestureDetector(
                onTap: () => onOpenLegalPage(
                  title: '用户协议',
                  url: '',
                ),
                child: Text(
                  userAgreementLabel,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.primary,
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
            ),
            const TextSpan(text: '和'),
            WidgetSpan(
              child: GestureDetector(
                onTap: () => onOpenLegalPage(
                  title: '隐私政策',
                  url: '',
                ),
                child: Text(
                  privacyPolicyLabel,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.primary,
                    decoration: TextDecoration.underline,
                  ),
                ),
              ),
            ),
          ],
        ),
        textAlign: TextAlign.center,
      ),
    );
  }
}
