/// App update strategy enum.
enum UpdateStrategy {
  /// Auto download and install on WIFI.
  autoDownloadAndInstall,

  /// Download only, manual install (default).
  downloadOnly,

  /// Fully manual check and download.
  manual,
}

/// Update strategy configuration.
class UpdateConfig {
  final UpdateStrategy strategy;
  final bool forceUpdateAutoDownload;
  final bool showDownloadNotification;
  final bool wifiOnlyAutoDownload;

  const UpdateConfig({
    this.strategy = UpdateStrategy.downloadOnly,
    this.forceUpdateAutoDownload = true,
    this.showDownloadNotification = true,
    this.wifiOnlyAutoDownload = true,
  });

  factory UpdateConfig.fromJson(Map<String, dynamic> json) {
    return UpdateConfig(
      strategy: UpdateStrategy.values.firstWhere(
        (e) => e.name == json['strategy'],
        orElse: () => UpdateStrategy.downloadOnly,
      ),
      forceUpdateAutoDownload: json['forceUpdateAutoDownload'] ?? true,
      showDownloadNotification: json['showDownloadNotification'] ?? true,
      wifiOnlyAutoDownload: json['wifiOnlyAutoDownload'] ?? true,
    );
  }

  Map<String, dynamic> toJson() => {
        'strategy': strategy.name,
        'forceUpdateAutoDownload': forceUpdateAutoDownload,
        'showDownloadNotification': showDownloadNotification,
        'wifiOnlyAutoDownload': wifiOnlyAutoDownload,
      };

  UpdateConfig copyWith({
    UpdateStrategy? strategy,
    bool? forceUpdateAutoDownload,
    bool? showDownloadNotification,
    bool? wifiOnlyAutoDownload,
  }) {
    return UpdateConfig(
      strategy: strategy ?? this.strategy,
      forceUpdateAutoDownload:
          forceUpdateAutoDownload ?? this.forceUpdateAutoDownload,
      showDownloadNotification:
          showDownloadNotification ?? this.showDownloadNotification,
      wifiOnlyAutoDownload: wifiOnlyAutoDownload ?? this.wifiOnlyAutoDownload,
    );
  }
}

/// Download progress info.
class DownloadProgress {
  final int downloadedBytes;
  final int totalBytes;
  final double progress;
  final double speed;
  final int estimatedTimeRemaining;
  final int elapsedTime;
  final String? filePath;

  bool get isComplete => progress >= 1.0;

  const DownloadProgress({
    required this.downloadedBytes,
    required this.totalBytes,
    required this.progress,
    required this.speed,
    required this.estimatedTimeRemaining,
    required this.elapsedTime,
    this.filePath,
  });

  String get speedText {
    if (speed < 1024) {
      return '${speed.toStringAsFixed(0)} B/s';
    } else if (speed < 1024 * 1024) {
      return '${(speed / 1024).toStringAsFixed(1)} KB/s';
    } else {
      return '${(speed / (1024 * 1024)).toStringAsFixed(1)} MB/s';
    }
  }

  String get downloadedText {
    if (downloadedBytes < 1024) {
      return '$downloadedBytes B';
    } else if (downloadedBytes < 1024 * 1024) {
      return '${(downloadedBytes / 1024).toStringAsFixed(1)} KB';
    } else {
      return '${(downloadedBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
  }

  String get totalSizeText {
    if (totalBytes < 1024) {
      return '$totalBytes B';
    } else if (totalBytes < 1024 * 1024) {
      return '${(totalBytes / 1024).toStringAsFixed(1)} KB';
    } else {
      return '${(totalBytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
  }

  String _formatDuration(int seconds) {
    if (seconds < 60) {
      return '${seconds}s';
    } else if (seconds < 3600) {
      final minutes = seconds ~/ 60;
      final secs = seconds % 60;
      return '${minutes}m ${secs}s';
    } else {
      final hours = seconds ~/ 3600;
      final minutes = (seconds % 3600) ~/ 60;
      return '${hours}h ${minutes}m';
    }
  }

  String get etaText => _formatDuration(estimatedTimeRemaining);
  String get elapsedText => _formatDuration(elapsedTime);
}
