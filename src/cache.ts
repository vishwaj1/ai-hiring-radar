export interface CacheOptions {
  /** Serve straight from memory for this long. */
  ttlMs: number;
  /** After the TTL, keep serving the old copy while refreshing in the background, up to this age. */
  maxStaleMs: number;
  now?: () => number;
}

export interface CacheHit<T> {
  data: T;
  fetchedAt: number;
  stale: boolean;
}

/**
 * One cached value with stale-while-revalidate and stale-if-error.
 * Concurrent callers share a single in-flight load, so a burst of tool
 * calls never turns into a burst of requests to a company's job board.
 */
export class SnapshotCache<T> {
  private entry: { data: T; at: number } | null = null;
  private inflight: Promise<T> | null = null;
  private readonly opts: CacheOptions;
  private readonly now: () => number;

  constructor(opts: CacheOptions) {
    this.opts = opts;
    this.now = opts.now ?? Date.now;
  }

  async get(loader: () => Promise<T>): Promise<CacheHit<T>> {
    const current = this.entry;
    if (current) {
      const age = this.now() - current.at;
      if (age < this.opts.ttlMs) {
        return { data: current.data, fetchedAt: current.at, stale: false };
      }
      if (age < this.opts.maxStaleMs) {
        this.refresh(loader).catch(() => {});
        return { data: current.data, fetchedAt: current.at, stale: true };
      }
    }
    try {
      const data = await this.refresh(loader);
      return { data, fetchedAt: this.entry?.at ?? this.now(), stale: false };
    } catch (err) {
      if (current) return { data: current.data, fetchedAt: current.at, stale: true };
      throw err;
    }
  }

  private refresh(loader: () => Promise<T>): Promise<T> {
    if (!this.inflight) {
      this.inflight = loader()
        .then((data) => {
          this.entry = { data, at: this.now() };
          return data;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }
}
