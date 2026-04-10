/**
 * Worker lifecycle tests.
 *
 * These tests verify that the worker process:
 * 1. Stays alive after startup (does NOT exit prematurely)
 * 2. Shuts down gracefully on SIGTERM
 *
 * The worker is launched as a child process running the compiled entry point.
 */

import { describe, it, expect, afterEach } from "vitest";
import { fork, ChildProcess } from "node:child_process";
import { resolve } from "node:path";

const ROOT_DIR = resolve(import.meta.dirname, "..");
const WORKER_ENTRY = resolve(ROOT_DIR, "apps/worker/dist/index.js");

describe("worker process lifecycle", () => {
  let worker: ChildProcess | null = null;

  afterEach(() => {
    if (worker && !worker.killed) {
      worker.kill("SIGKILL");
      worker = null;
    }
  });

  it("MUST stay alive for at least 2 seconds after startup", async () => {
    worker = fork(WORKER_ENTRY, [], { stdio: "pipe" });

    let exited = false;

    worker.on("exit", () => {
      exited = true;
    });

    // Wait 2 seconds, then check the process has NOT exited
    await new Promise((resolve) => setTimeout(resolve, 2000));

    expect(exited).toBe(false);
    expect(worker.killed).toBe(false);
  });

  it("MUST shut down gracefully on SIGTERM", async () => {
    worker = fork(WORKER_ENTRY, [], { stdio: "pipe" });

    // Wait for startup
    const startupMessage = await new Promise<string>((resolve) => {
      worker!.on("message", (msg: string) => resolve(msg));
      // Also listen for stdout as console.log doesn't trigger 'message'
      worker!.stdout!.on("data", (data: Buffer) => {
        const text = data.toString().trim();
        if (text.includes("[worker]")) resolve(text);
      });
    });

    expect(startupMessage).toContain("[worker] started");

    // Send SIGTERM
    worker.kill("SIGTERM");

    // Wait for exit with timeout
    const exitResult = await new Promise<{ code: number | null }>((resolve) => {
      const timeout = setTimeout(() => {
        resolve({ code: -999 }); // timeout = did not exit
      }, 3000);

      worker!.on("exit", (code) => {
        clearTimeout(timeout);
        resolve({ code });
      });
    });

    expect(exitResult.code).not.toBe(-999);
    expect(exitResult.code).toBe(0);
  });
});
