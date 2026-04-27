import 'package:flutter/material.dart';

/// Agreement checkbox widget for register mode.
///
/// Stateless — parent manages [agreed] state.
/// Taps on agreement links invoke [onOpenLegalPage].
class AgreementCheckbox extends StatelessWidget {
  final bool agreed;
  final ValueChanged<bool> onChanged;
  final void Function({required String title, required String url})
      onOpenLegalPage;
  final String userAgreementLabel;
  final String privacyPolicyLabel;

  const AgreementCheckbox({
    super.key,
    required this.agreed,
    required this.onChanged,
    required this.onOpenLegalPage,
    this.userAgreementLabel = '《用户协议》',
    this.privacyPolicyLabel = '《隐私政策》',
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SizedBox(
          width: 24,
          height: 24,
          child: Checkbox(
            value: agreed,
            onChanged: (v) => onChanged(v ?? false),
            materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Wrap(
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              GestureDetector(
                onTap: () => onChanged(!agreed),
                child: Text(
                  '我已阅读并同意',
                  style: TextStyle(
                    fontSize: 13,
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
              _LegalLink(
                text: userAgreementLabel,
                onTap: () => onOpenLegalPage(
                  title: '用户协议',
                  url: '', // URL is built by the parent via LegalService
                ),
                theme: theme,
              ),
              Text(
                '和',
                style: TextStyle(
                  fontSize: 13,
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              _LegalLink(
                text: privacyPolicyLabel,
                onTap: () => onOpenLegalPage(
                  title: '隐私政策',
                  url: '',
                ),
                theme: theme,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LegalLink extends StatelessWidget {
  final String text;
  final VoidCallback onTap;
  final ThemeData theme;

  const _LegalLink({
    required this.text,
    required this.onTap,
    required this.theme,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
        child: Text(
          text,
          style: TextStyle(
            fontSize: 13,
            color: theme.colorScheme.primary,
            decoration: TextDecoration.underline,
          ),
        ),
      ),
    );
  }
}
