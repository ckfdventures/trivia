import type { Logger } from "../shared/logger.js";

export interface Job {
  readonly name: string;
  readonly intervalMs: number;
  run(): Promise<void> | void;
}

/** Runs each job on its own interval; a failing run is logged and retried next tick. */
export class JobScheduler {
  private readonly timers: NodeJS.Timeout[] = [];

  constructor(private readonly logger: Logger) {}

  start(jobs: Job[]): void {
    for (const job of jobs) {
      const timer = setInterval(async () => {
        try {
          await job.run();
        } catch (err) {
          this.logger.error(`${job.name} failed`, err);
        }
      }, job.intervalMs);
      timer.unref();
      this.timers.push(timer);
    }
  }

  stop(): void {
    this.timers.forEach(clearInterval);
    this.timers.length = 0;
  }
}
