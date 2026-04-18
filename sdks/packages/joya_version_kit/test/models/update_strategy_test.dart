import 'package:flutter_test/flutter_test.dart';
import 'package:joya_version_kit/src/models/update_strategy.dart';

void main() {
  group('UpdateConfig', () {
    test('default values', () {
      const config = UpdateConfig();

      expect(config.strategy, UpdateStrategy.downloadOnly);
      expect(config.forceUpdateAutoDownload, isTrue);
      expect(config.showDownloadNotification, isTrue);
      expect(config.wifiOnlyAutoDownload, isTrue);
    });

    test('fromJson parses known strategy', () {
      final json = <String, dynamic>{
        'strategy': 'manual',
        'forceUpdateAutoDownload': false,
        'showDownloadNotification': false,
        'wifiOnlyAutoDownload': false,
      };

      final config = UpdateConfig.fromJson(json);

      expect(config.strategy, UpdateStrategy.manual);
      expect(config.forceUpdateAutoDownload, isFalse);
      expect(config.showDownloadNotification, isFalse);
      expect(config.wifiOnlyAutoDownload, isFalse);
    });

    test('fromJson falls back to downloadOnly for unknown strategy', () {
      final json = <String, dynamic>{
        'strategy': 'unknown',
      };

      final config = UpdateConfig.fromJson(json);

      expect(config.strategy, UpdateStrategy.downloadOnly);
    });

    test('toJson outputs correct map', () {
      const config = UpdateConfig(
        strategy: UpdateStrategy.autoDownloadAndInstall,
        forceUpdateAutoDownload: true,
        showDownloadNotification: true,
        wifiOnlyAutoDownload: false,
      );

      final json = config.toJson();

      expect(json['strategy'], 'autoDownloadAndInstall');
      expect(json['forceUpdateAutoDownload'], isTrue);
      expect(json['showDownloadNotification'], isTrue);
      expect(json['wifiOnlyAutoDownload'], isFalse);
    });

    test('copyWith overrides values', () {
      const config = UpdateConfig();
      final updated = config.copyWith(
        strategy: UpdateStrategy.manual,
        wifiOnlyAutoDownload: false,
      );

      expect(updated.strategy, UpdateStrategy.manual);
      expect(updated.forceUpdateAutoDownload, isTrue);
      expect(updated.showDownloadNotification, isTrue);
      expect(updated.wifiOnlyAutoDownload, isFalse);
    });
  });

  group('DownloadProgress', () {
    test('isComplete when progress >= 1.0', () {
      const p1 = DownloadProgress(
        downloadedBytes: 100,
        totalBytes: 100,
        progress: 1.0,
        speed: 0,
        estimatedTimeRemaining: 0,
        elapsedTime: 0,
      );
      const p2 = DownloadProgress(
        downloadedBytes: 100,
        totalBytes: 100,
        progress: 1.1,
        speed: 0,
        estimatedTimeRemaining: 0,
        elapsedTime: 0,
      );

      expect(p1.isComplete, isTrue);
      expect(p2.isComplete, isTrue);
    });

    test('speedText formats correctly', () {
      const b = DownloadProgress(
        downloadedBytes: 0,
        totalBytes: 100,
        progress: 0,
        speed: 500,
        estimatedTimeRemaining: 0,
        elapsedTime: 0,
      );
      const kb = DownloadProgress(
        downloadedBytes: 0,
        totalBytes: 100,
        progress: 0,
        speed: 2048,
        estimatedTimeRemaining: 0,
        elapsedTime: 0,
      );
      const mb = DownloadProgress(
        downloadedBytes: 0,
        totalBytes: 100,
        progress: 0,
        speed: 2097152,
        estimatedTimeRemaining: 0,
        elapsedTime: 0,
      );

      expect(b.speedText, '500 B/s');
      expect(kb.speedText, '2.0 KB/s');
      expect(mb.speedText, '2.0 MB/s');
    });

    test('downloadedText and totalSizeText format correctly', () {
      const p = DownloadProgress(
        downloadedBytes: 1536,
        totalBytes: 1048576,
        progress: 0,
        speed: 0,
        estimatedTimeRemaining: 0,
        elapsedTime: 0,
      );

      expect(p.downloadedText, '1.5 KB');
      expect(p.totalSizeText, '1.0 MB');
    });

    test('etaText and elapsedText format durations', () {
      const p = DownloadProgress(
        downloadedBytes: 0,
        totalBytes: 100,
        progress: 0,
        speed: 0,
        estimatedTimeRemaining: 3661,
        elapsedTime: 125,
        filePath: '/tmp/app.apk',
      );

      expect(p.etaText, '1h 1m');
      expect(p.elapsedText, '2m 5s');
    });
  });
}
