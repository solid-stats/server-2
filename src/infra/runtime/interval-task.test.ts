/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/prefer-promise-reject-errors, init-declarations, no-magic-numbers */
import { describe, expect, it, vi } from "vitest";

import { IntervalTask } from "./interval-task.js";

describe("IntervalTask", () => {
  it("runs immediately on start, repeats without overlap, and closes cleanly", async () => {
    vi.useFakeTimers();
    try {
      let resolveTask: (() => void) | undefined;
      const task = vi.fn(
          () =>
            new Promise<void>((resolve) => {
              resolveTask = resolve;
            }),
        ),
        interval = new IntervalTask({
          intervalMs: 50,
          logger: logger(),
          name: "test-task",
          task,
        });

      interval.start();
      interval.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(task).toHaveBeenCalledTimes(1);

      await interval.runOnce();
      expect(task).toHaveBeenCalledTimes(1);

      resolveTask?.();
      await vi.advanceTimersByTimeAsync(50);
      expect(task).toHaveBeenCalledTimes(2);

      await interval.close();
      await vi.advanceTimersByTimeAsync(50);
      expect(task).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs task failures and continues", async () => {
    const testLogger = logger(),
      interval = new IntervalTask({
        intervalMs: 50,
        logger: testLogger,
        name: "failing-task",
        task: async () => {
          throw new Error("boom");
        },
      });

    await interval.runOnce();

    expect(testLogger.error).toHaveBeenCalledWith(
      {
        error: { message: "boom", name: "Error" },
        task: "failing-task",
      },
      "runtime task failed",
    );
  });

  it("logs unknown failures", async () => {
    const testLogger = logger(),
      interval = new IntervalTask({
        intervalMs: 50,
        logger: testLogger,
        name: "unknown-failure",
        task: () => Promise.reject("boom"),
      });

    await interval.runOnce();

    expect(testLogger.error).toHaveBeenCalledWith(
      {
        error: { message: "unknown interval task failure" },
        task: "unknown-failure",
      },
      "runtime task failed",
    );
  });

  it("ignores ticks after close", async () => {
    const task = vi.fn(async () => {}),
      interval = new IntervalTask({
        intervalMs: 50,
        logger: logger(),
        name: "closed-task",
        task,
      });

    await interval.close();
    await (interval as unknown as { tick(): Promise<void> }).tick();

    expect(task).not.toHaveBeenCalled();
  });

  it("does not reschedule when closed by its running task", async () => {
    vi.useFakeTimers();
    try {
      let interval = undefined as unknown as IntervalTask;
      const task = vi.fn(async () => interval.close());
      interval = new IntervalTask({
        intervalMs: 50,
        logger: logger(),
        name: "self-closing-task",
        task,
      });

      interval.start();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(50);

      expect(task).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

function logger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
  };
}
