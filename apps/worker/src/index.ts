/**
 * Worker entry point.
 *
 * Phase 1: minimal skeleton that starts, logs readiness, and keeps running.
 * Future: async task processing, audit compensation, scheduled jobs.
 */

let keepAliveTimer: ReturnType<typeof setInterval>;

const shutdown = (signal: string) => {
  console.log(`[worker] received ${signal}, shutting down`);
  clearInterval(keepAliveTimer);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Keep the event loop alive so the container does not restart in a loop.
// Replaced with a real task queue / job scheduler in a future phase.
keepAliveTimer = setInterval(() => {}, 60_000);

console.log('[worker] started, waiting for tasks...');
