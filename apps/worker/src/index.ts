/**
 * Worker entry point.
 *
 * Phase 1: minimal skeleton that starts, logs readiness, and keeps running.
 * Future: async task processing, audit compensation, scheduled jobs.
 */

const shutdown = (signal: string) => {
  console.log(`[worker] received ${signal}, shutting down`);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

console.log('[worker] started, waiting for tasks...');
