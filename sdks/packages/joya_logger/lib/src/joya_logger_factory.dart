import 'package:flutter/foundation.dart' show kReleaseMode;
import 'package:logger/logger.dart';

/// Creates the release-safe filter used by Joya app loggers.
///
/// The upstream logger package defaults to [DevelopmentFilter], which drops all
/// logs in release builds. Feedback reports need release logs, so Joya app
/// loggers use [ProductionFilter].
LogFilter createJoyaLogFilter() => ProductionFilter();

/// Resolves the standard Joya logger level for runtime mode.
Level resolveJoyaLoggerLevel({bool releaseMode = kReleaseMode}) {
  return releaseMode ? Level.info : Level.debug;
}

/// Creates a release-safe logger for Joya Flutter apps.
Logger createJoyaLogger({
  required List<LogOutput> outputs,
  LogPrinter? printer,
  List<LogOutput> extraOutputs = const [],
  bool releaseMode = kReleaseMode,
}) {
  final allOutputs = <LogOutput>[...outputs, ...extraOutputs];

  return Logger(
    filter: createJoyaLogFilter(),
    level: resolveJoyaLoggerLevel(releaseMode: releaseMode),
    output: allOutputs.isEmpty
        ? null
        : (allOutputs.length == 1 ? allOutputs.first : MultiOutput(allOutputs)),
    printer: printer ?? PrettyPrinter(methodCount: 2),
  );
}
