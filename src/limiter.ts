/** Bounds how many requests run at once and how fast new ones start. */
export class Limiter {
  private active = 0;
  private readonly waiting: (() => void)[] = [];
  private nextStart = 0;
  private readonly concurrency: number;
  private readonly minGapMs: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(
    concurrency: number,
    minGapMs: number,
    sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => number = Date.now,
  ) {
    this.concurrency = concurrency;
    this.minGapMs = minGapMs;
    this.sleep = sleep;
    this.now = now;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active < this.concurrency) {
      this.active += 1;
    } else {
      // The slot is handed over directly by release(), so `active` is unchanged.
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    }
    const start = Math.max(this.now(), this.nextStart);
    this.nextStart = start + this.minGapMs;
    const wait = start - this.now();
    if (wait > 0) await this.sleep(wait);
  }

  private release(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.active -= 1;
  }
}
