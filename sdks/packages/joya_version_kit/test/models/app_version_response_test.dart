import 'package:flutter_test/flutter_test.dart';
import 'package:joya_version_kit/src/models/app_version_response.dart';

void main() {
  group('AppVersionResponse', () {
    test('fromJson parses camelCase fields', () {
      final json = <String, dynamic>{
        'platform': 'android',
        'channel': 'stable',
        'latestVersion': '1.2.3',
        'minSupportedVersion': '1.0.0',
        'downloadUrl': 'https://example.com/app.apk',
        'releaseNotes': 'Bug fixes',
        'forceUpdate': true,
        'shouldPrompt': true,
        'rolloutPercent': 50,
        'buildNumber': '10203',
        'forceUpdateReason': 'Critical security fix',
      };

      final response = AppVersionResponse.fromJson(json);

      expect(response.platform, 'android');
      expect(response.channel, 'stable');
      expect(response.latestVersion, '1.2.3');
      expect(response.minSupportedVersion, '1.0.0');
      expect(response.downloadUrl, 'https://example.com/app.apk');
      expect(response.releaseNotes, 'Bug fixes');
      expect(response.forceUpdate, isTrue);
      expect(response.shouldPrompt, isTrue);
      expect(response.rolloutPercent, 50);
      expect(response.buildNumber, '10203');
      expect(response.forceUpdateReason, 'Critical security fix');
    });

    test('fromJson parses snake_case fields', () {
      final json = <String, dynamic>{
        'platform': 'ios',
        'channel': 'beta',
        'latest_version': '2.0.0',
        'min_supported_version': '1.5.0',
        'download_url': 'https://example.com/ios.ipa',
        'release_notes': 'New features',
        'force_update': false,
        'should_prompt': false,
        'rollout_percent': 10,
        'build_number': '20000',
        'force_update_reason': 'Compliance update',
      };

      final response = AppVersionResponse.fromJson(json);

      expect(response.platform, 'ios');
      expect(response.channel, 'beta');
      expect(response.latestVersion, '2.0.0');
      expect(response.minSupportedVersion, '1.5.0');
      expect(response.downloadUrl, 'https://example.com/ios.ipa');
      expect(response.releaseNotes, 'New features');
      expect(response.forceUpdate, isFalse);
      expect(response.shouldPrompt, isFalse);
      expect(response.rolloutPercent, 10);
      expect(response.buildNumber, '20000');
      expect(response.forceUpdateReason, 'Compliance update');
    });

    test('toJson outputs camelCase fields', () {
      const response = AppVersionResponse(
        platform: 'android',
        channel: 'stable',
        latestVersion: '1.0.0',
        minSupportedVersion: '0.9.0',
        downloadUrl: 'https://example.com/app.apk',
        releaseNotes: 'First release',
        forceUpdate: false,
        shouldPrompt: true,
        rolloutPercent: 100,
        buildNumber: '100',
        forceUpdateReason: null,
      );

      final json = response.toJson();

      expect(json['platform'], 'android');
      expect(json['channel'], 'stable');
      expect(json['latest_version'], '1.0.0');
      expect(json['min_supported_version'], '0.9.0');
      expect(json['download_url'], 'https://example.com/app.apk');
      expect(json['release_notes'], 'First release');
      expect(json['force_update'], isFalse);
      expect(json['should_prompt'], isTrue);
      expect(json['rollout_percent'], 100);
      expect(json['build_number'], '100');
      expect(json.containsKey('force_update_reason'), isTrue);
      expect(json['force_update_reason'], isNull);
    });

    test('fromJson uses defaults for missing optional fields', () {
      final json = <String, dynamic>{
        'platform': 'android',
        'channel': 'stable',
        'latestVersion': '1.0.0',
        'forceUpdate': false,
        'shouldPrompt': true,
      };

      final response = AppVersionResponse.fromJson(json);

      expect(response.minSupportedVersion, isNull);
      expect(response.downloadUrl, isNull);
      expect(response.releaseNotes, isNull);
      expect(response.rolloutPercent, isNull);
      expect(response.buildNumber, isNull);
      expect(response.forceUpdateReason, isNull);
    });
  });
}
