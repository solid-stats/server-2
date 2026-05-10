export interface IntervalTaskLogger {
  error(bindings: Record<string, unknown>, message: string): void;
  info(bindings: Record<string, unknown>, message: string): void;
}

export interface IntervalTaskOptions {
  intervalMs: number;
  logger: IntervalTaskLogger;
  name: string;
  task: () => Promise<void>;
}

export class IntervalTask {
  private running = false;

  private stopped = true;

  private timer: NodeJS.Timeout | undefined;

  public constructor(private readonly options: IntervalTaskOptions) {}

  public start(): void {
    if (!this.stopped) {
      return;
    }
    this.stopped = false;
    this.schedule(0);
  }

  public async runOnce(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.options.task();
    } catch (error) {
      this.options.logger.error(
        {
          error:
            error instanceof Error
              ? { message: error.message, name: error.name }
              : { message: "unknown interval task failure" },
          task: this.options.name,
        },
        "runtime task failed",
      );
    } finally {
      this.running = false;
    }
  }

  public close(): Promise<void> {
    this.stopped = true;
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    return Promise.resolve();
  }

  private schedule(delayMs: number): void {
    this.timer = setTimeout(() => {
      void this.tick();
    }, delayMs);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    if (this.stopped) {
      return;
    }
    await this.runOnce();
    if (this.shouldContinue()) {
      this.schedule(this.options.intervalMs);
    }
  }

  private shouldContinue(): boolean {
    return !this.stopped;
  }
}
