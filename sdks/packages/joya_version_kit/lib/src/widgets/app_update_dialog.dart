import 'dart:io';
import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/app_version_info.dart';
import '../models/update_strategy.dart';

/// Update dialog widget for displaying version info and download progress.
class AppUpdateDialog extends StatefulWidget {
  /// Version info from the backend.
  final AppVersionInfo versionInfo;

  /// Whether this is a forced update (dialog cannot be dismissed).
  final bool forceUpdate;

  /// Current app version string.
  final String? currentVersion;

  /// Current app build number.
  final String? currentBuildNumber;

  /// Notifier for download progress. When updated, the dialog reflects changes.
  final ValueNotifier<DownloadProgress?>? progressNotifier;

  /// Called when the user presses the primary update action button.
  final VoidCallback? onUpdate;

  /// Called when the user presses the dismiss ("later") action.
  final VoidCallback? onDismiss;

  /// Creates an [AppUpdateDialog].
  const AppUpdateDialog({
    super.key,
    required this.versionInfo,
    this.forceUpdate = false,
    this.currentVersion,
    this.currentBuildNumber,
    this.progressNotifier,
    this.onUpdate,
    this.onDismiss,
  });

  /// Convenience method to show the dialog.
  static Future<void> show({
    required BuildContext context,
    required AppVersionInfo versionInfo,
    bool forceUpdate = false,
    String? currentVersion,
    String? currentBuildNumber,
    ValueNotifier<DownloadProgress?>? progressNotifier,
    VoidCallback? onUpdate,
    VoidCallback? onDismiss,
  }) {
    return showDialog(
      context: context,
      barrierDismissible: !forceUpdate,
      builder: (_) => AppUpdateDialog(
        versionInfo: versionInfo,
        forceUpdate: forceUpdate,
        currentVersion: currentVersion,
        currentBuildNumber: currentBuildNumber,
        progressNotifier: progressNotifier,
        onUpdate: onUpdate,
        onDismiss: onDismiss,
      ),
    );
  }

  /// Validates and launches the update URL.
  /// On iOS, only App Store URLs are allowed.
  static Future<bool> launchUpdateUrl(String url) async {
    final uri = Uri.parse(url);
    if (Platform.isIOS) {
      final host = uri.host.toLowerCase();
      final isAppStore = uri.scheme.toLowerCase() == 'itms-apps' ||
          host.endsWith('apps.apple.com');
      if (!isAppStore) return false;
    }
    return launchUrl(uri, mode: LaunchMode.externalApplication);
  }

  @override
  State<AppUpdateDialog> createState() => _AppUpdateDialogState();
}

class _AppUpdateDialogState extends State<AppUpdateDialog> {
  @override
  void initState() {
    super.initState();
    widget.progressNotifier?.addListener(_onProgressChanged);
  }

  @override
  void didUpdateWidget(covariant AppUpdateDialog oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.progressNotifier != widget.progressNotifier) {
      oldWidget.progressNotifier?.removeListener(_onProgressChanged);
      widget.progressNotifier?.addListener(_onProgressChanged);
    }
  }

  @override
  void dispose() {
    widget.progressNotifier?.removeListener(_onProgressChanged);
    super.dispose();
  }

  void _onProgressChanged() {
    if (mounted) setState(() {});
  }

  String get _releaseNotes =>
      widget.versionInfo.releaseNotes?.trim().isNotEmpty == true
          ? widget.versionInfo.releaseNotes!
          : '暂无更新说明';

  bool get _canDismiss => !widget.forceUpdate;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final progress = widget.progressNotifier?.value;
    final isDownloading = progress != null && !progress.isComplete;

    return PopScope(
      canPop: _canDismiss && !isDownloading,
      child: AlertDialog(
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: widget.forceUpdate
                    ? Colors.red.shade50
                    : colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Icon(
                widget.forceUpdate
                    ? Icons.warning_rounded
                    : Icons.celebration_rounded,
                color: widget.forceUpdate ? Colors.red : colorScheme.primary,
                size: 24,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                widget.forceUpdate ? '重要更新' : '发现新版本',
                style: TextStyle(
                  color: widget.forceUpdate
                      ? Colors.red.shade700
                      : colorScheme.primary,
                  fontWeight: FontWeight.bold,
                  fontSize: 18,
                ),
              ),
            ),
          ],
        ),
        content: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 500),
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                if (widget.forceUpdate &&
                    widget.versionInfo.forceUpdateReason != null) ...[
                  _buildForceUpdateReason(context),
                  const SizedBox(height: 16),
                ],
                _buildVersionComparison(context),
                const SizedBox(height: 16),
                Text(
                  '更新内容',
                  style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: colorScheme.onSurface,
                  ),
                ),
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.all(14),
                  decoration: BoxDecoration(
                    color: colorScheme.primaryContainer.withValues(alpha: 0.3),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: colorScheme.primary.withValues(alpha: 0.2),
                    ),
                  ),
                  child: Text(
                    _releaseNotes,
                    style: TextStyle(
                      fontSize: 13,
                      height: 1.5,
                      color: colorScheme.onSurface,
                    ),
                  ),
                ),
                if (progress != null) ...[
                  const SizedBox(height: 16),
                  _buildDownloadProgress(context, progress),
                ],
                if (widget.versionInfo.channel != 'official') ...[
                  const SizedBox(height: 12),
                  Text(
                    '渠道: ${widget.versionInfo.channel}',
                    style: TextStyle(
                      fontSize: 11,
                      color: Colors.grey.shade600,
                    ),
                  ),
                ],
              ],
            ),
          ),
        ),
        actions: [
          if (_canDismiss && !isDownloading)
            TextButton(
              onPressed: () {
                widget.onDismiss?.call();
                Navigator.of(context).pop();
              },
              child: const Text('稍后'),
            ),
          ElevatedButton.icon(
            onPressed: isDownloading ? null : widget.onUpdate,
            icon: Icon(
              Platform.isAndroid
                  ? Icons.cloud_download_outlined
                  : Icons.open_in_new_rounded,
              size: 18,
            ),
            label: Text(
              isDownloading
                  ? (progress.isComplete == true ? '下载完成' : '下载中...')
                  : (Platform.isAndroid ? '立即更新' : '前往更新'),
            ),
            style: ElevatedButton.styleFrom(
              backgroundColor: widget.forceUpdate
                  ? Colors.red.shade600
                  : colorScheme.primary,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(
                horizontal: 20,
                vertical: 12,
              ),
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(10),
              ),
              elevation: 2,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildForceUpdateReason(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [Colors.red.shade50, Colors.orange.shade50],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.red.shade200, width: 1.5),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.info_rounded, color: Colors.red.shade700, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '更新原因',
                  style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                    color: Colors.red.shade900,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  widget.versionInfo.forceUpdateReason!,
                  style: TextStyle(
                    fontSize: 13,
                    height: 1.4,
                    color: Colors.red.shade800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildVersionComparison(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final newBuildNumber = widget.versionInfo.buildNumber ?? '未知';

    return Row(
      children: [
        Expanded(
          child: _buildVersionCard(
            context,
            icon: Icons.phone_android,
            label: '当前版本',
            version: widget.currentVersion ?? '未知',
            buildNumber: widget.currentBuildNumber ?? '未知',
            color: Colors.grey,
          ),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8),
          child: Icon(Icons.arrow_forward, color: colorScheme.primary),
        ),
        Expanded(
          child: _buildVersionCard(
            context,
            icon: Icons.new_releases_rounded,
            label: '最新版本',
            version: widget.versionInfo.latestVersion.split('+').first,
            buildNumber: newBuildNumber,
            color: Colors.green,
          ),
        ),
      ],
    );
  }

  Widget _buildDownloadProgress(BuildContext context, DownloadProgress p) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.orange.shade50,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: Colors.orange.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (!p.isComplete)
                SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: Colors.orange.shade700,
                  ),
                ),
              if (!p.isComplete) const SizedBox(width: 8),
              Text(
                p.isComplete ? '下载完成' : '正在下载更新包...',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: Colors.orange.shade900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: p.progress.clamp(0.0, 1.0),
              backgroundColor: Colors.orange.shade100,
              valueColor: AlwaysStoppedAnimation<Color>(
                Colors.orange.shade700,
              ),
              minHeight: 8,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            '${(p.progress * 100).toStringAsFixed(1)}%  (${p.downloadedText} / ${p.totalSizeText})',
            style: TextStyle(
              fontSize: 12,
              color: Colors.orange.shade700,
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                '速度: ${p.speedText}',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade600,
                ),
              ),
              Text(
                '已用: ${p.elapsedText}',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade600,
                ),
              ),
              Text(
                '剩余: ${p.etaText}',
                style: TextStyle(
                  fontSize: 11,
                  color: Colors.grey.shade600,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildVersionCard(
    BuildContext context, {
    required IconData icon,
    required String label,
    required String version,
    required String buildNumber,
    required MaterialColor color,
  }) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color.shade50, color.shade100],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.shade200),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(icon, size: 16, color: color.shade700),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 11,
                    color: color.shade700,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            version,
            style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.bold,
              color: color.shade900,
            ),
          ),
          const SizedBox(height: 2),
          Text(
            'Build $buildNumber',
            style: TextStyle(
              fontSize: 11,
              color: color.shade600,
            ),
          ),
        ],
      ),
    );
  }
}
