import 'package:flutter_test/flutter_test.dart';
import 'package:joya_result/joya_result.dart';
import 'package:joya_version_kit/src/models/app_version_info.dart';
import 'package:joya_version_kit/src/version_check_service.dart';
import 'package:joya_version_kit/src/version_repository.dart';

class _MockRepository implements VersionRepository {
  Result<AppVersionInfo>? checkResult;
  String? ignoredVersion;

  @override
  Future<Result<AppVersionInfo>> checkVersion({
    required String platform,
    required String currentVersion,
    required String channel,
  }) async {
    return checkResult ?? Result.failure('not set');
  }

  @override
  Future<void> ignoreVersion(String version) async {
    ignoredVersion = version;
  }

  @override
  Future<String?> loadIgnoredVersion() async => ignoredVersion;
}

void main() {
  group('VersionCheckService', () {
    late _MockRepository repo;
    late VersionCheckService service;

    setUp(() {
      repo = _MockRepository();
      service = VersionCheckService(repository: repo);
    });

    group('hashToBucket', () {
      test('returns 0 for empty string', () {
        expect(VersionCheckService.hashToBucket(''), 0);
      });

      test('returns consistent bucket for same seed', () {
        final b1 = VersionCheckService.hashToBucket('device-123');
        final b2 = VersionCheckService.hashToBucket('device-123');
        expect(b1, b2);
        expect(b1 >= 0 && b1 < 100, isTrue);
      });

      test('different seeds may produce different buckets', () {
        final b1 = VersionCheckService.hashToBucket('a');
        final b2 = VersionCheckService.hashToBucket('b');
        // They could be the same, but likely different
        expect(b1 >= 0 && b1 < 100, isTrue);
        expect(b2 >= 0 && b2 < 100, isTrue);
      });

      test('matches JS implementation for known seeds', () {
        // JS: hash = 0; for 'abc' => hash = ((0*31+97)>>>0)%100 = 97
        // then ((97*31+98)>>>0)%100 = ((3007+98)%4294967296)%100 = 3105%100 = 5
        // then ((5*31+99)>>>0)%100 = (155+99)%100 = 254%100 = 54
        expect(VersionCheckService.hashToBucket('abc'), 54);
      });
    });

    group('isInRollout', () {
      test('100% rollout includes everyone', () {
        expect(VersionCheckService.isInRollout('any', 100), isTrue);
      });

      test('0% rollout excludes everyone', () {
        expect(VersionCheckService.isInRollout('any', 0), isFalse);
      });

      test('50% rollout includes bucket < 50', () {
        final bucket = VersionCheckService.hashToBucket('seed-xyz');
        final expected = bucket < 50;
        expect(VersionCheckService.isInRollout('seed-xyz', 50), expected);
      });
    });

    group('normalizeVersion', () {
      test('parses standard version', () {
        final v = VersionCheckService.normalizeVersion('1.2.3');
        expect(v!.major, 1);
        expect(v.minor, 2);
        expect(v.patch, 3);
        expect(v.build, isNull);
      });

      test('parses version with build number', () {
        final v = VersionCheckService.normalizeVersion('1.2.3+45');
        expect(v!.build, 45);
      });

      test('parses version with v prefix', () {
        final v = VersionCheckService.normalizeVersion('v2.0');
        expect(v!.major, 2);
        expect(v.minor, 0);
        expect(v.patch, 0);
      });

      test('fills missing parts with zeros', () {
        final v = VersionCheckService.normalizeVersion('5');
        expect(v!.major, 5);
        expect(v.minor, 0);
        expect(v.patch, 0);
      });

      test('returns null for null or empty', () {
        expect(VersionCheckService.normalizeVersion(null), isNull);
        expect(VersionCheckService.normalizeVersion(''), isNull);
        expect(VersionCheckService.normalizeVersion('   '), isNull);
      });
    });

    group('compareVersions', () {
      test('compares major', () {
        final a = VersionCheckService.normalizeVersion('2.0.0')!;
        final b = VersionCheckService.normalizeVersion('1.9.9')!;
        expect(VersionCheckService.compareVersions(a, b), greaterThan(0));
      });

      test('compares minor', () {
        final a = VersionCheckService.normalizeVersion('1.2.0')!;
        final b = VersionCheckService.normalizeVersion('1.1.9')!;
        expect(VersionCheckService.compareVersions(a, b), greaterThan(0));
      });

      test('compares patch', () {
        final a = VersionCheckService.normalizeVersion('1.0.3')!;
        final b = VersionCheckService.normalizeVersion('1.0.2')!;
        expect(VersionCheckService.compareVersions(a, b), greaterThan(0));
      });

      test('compares build when main parts equal', () {
        final a = VersionCheckService.normalizeVersion('1.0.0+5')!;
        final b = VersionCheckService.normalizeVersion('1.0.0+3')!;
        expect(VersionCheckService.compareVersions(a, b), greaterThan(0));
      });

      test('ignores build if one is missing', () {
        final a = VersionCheckService.normalizeVersion('1.0.0')!;
        final b = VersionCheckService.normalizeVersion('1.0.0+5')!;
        expect(VersionCheckService.compareVersions(a, b), 0);
      });

      test('returns 0 for equal versions', () {
        final a = VersionCheckService.normalizeVersion('1.2.3')!;
        final b = VersionCheckService.normalizeVersion('1.2.3')!;
        expect(VersionCheckService.compareVersions(a, b), 0);
      });

      test('returns 0 when either is null', () {
        expect(VersionCheckService.compareVersions(null, null), 0);
      });
    });

    group('shouldPromptUpdate', () {
      const info = AppVersionInfo(
        platform: 'android',
        channel: 'stable',
        latestVersion: '2.0.0',
        forceUpdate: false,
        shouldPrompt: true,
        rolloutPercent: 100,
      );

      test('returns false when current version is up-to-date', () {
        final result = service.shouldPromptUpdate(
          info: info,
          currentVersion: '2.0.0',
        );
        expect(result, isFalse);
      });

      test('returns false when current version is newer', () {
        final result = service.shouldPromptUpdate(
          info: info,
          currentVersion: '2.1.0',
        );
        expect(result, isFalse);
      });

      test('returns true when there is a newer version and server says prompt', () {
        final result = service.shouldPromptUpdate(
          info: info,
          currentVersion: '1.9.0',
        );
        expect(result, isTrue);
      });

      test('force update always shows even if ignored', () {
        final forced = info.copyWith(forceUpdate: true);
        final result = service.shouldPromptUpdate(
          info: forced,
          currentVersion: '1.0.0',
          ignoredVersion: '2.0.0',
        );
        expect(result, isTrue);
      });

      test('returns false when version is ignored and not forced', () {
        final result = service.shouldPromptUpdate(
          info: info,
          currentVersion: '1.0.0',
          ignoredVersion: '2.0.0',
        );
        expect(result, isFalse);
      });

      test('falls back to server shouldPrompt when versions cannot be parsed', () {
        final badInfo = AppVersionInfo(
          platform: 'android',
          channel: 'stable',
          latestVersion: 'bad',
          forceUpdate: false,
          shouldPrompt: true,
          rolloutPercent: 100,
        );
        final result = service.shouldPromptUpdate(
          info: badInfo,
          currentVersion: 'also-bad',
        );
        expect(result, isTrue);
      });
    });

    group('check', () {
      test('returns success with shouldShow=true', () async {
        repo.checkResult = Result.success(const AppVersionInfo(
          platform: 'android',
          channel: 'stable',
          latestVersion: '2.0.0',
          forceUpdate: false,
          shouldPrompt: true,
          rolloutPercent: 100,
        ));

        final result = await service.check(
          platform: 'android',
          currentVersion: '1.0.0',
          channel: 'stable',
        );

        expect(result.isSuccess, isTrue);
        expect(result.getOrThrow().shouldShow, isTrue);
      });

      test('returns success with shouldShow=false when ignored', () async {
        repo.ignoredVersion = '2.0.0';
        repo.checkResult = Result.success(const AppVersionInfo(
          platform: 'android',
          channel: 'stable',
          latestVersion: '2.0.0',
          forceUpdate: false,
          shouldPrompt: true,
          rolloutPercent: 100,
        ));

        final result = await service.check(
          platform: 'android',
          currentVersion: '1.0.0',
          channel: 'stable',
        );

        expect(result.isSuccess, isTrue);
        expect(result.getOrThrow().shouldShow, isFalse);
      });

      test('returns failure when repository fails', () async {
        repo.checkResult = Result.failure('network error');

        final result = await service.check(
          platform: 'android',
          currentVersion: '1.0.0',
          channel: 'stable',
        );

        expect(result.isSuccess, isFalse);
        expect(result.error, 'network error');
      });
    });
  });
}
