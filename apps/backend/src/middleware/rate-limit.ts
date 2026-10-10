// Small in-memory sliding-window limiter, keyed by an arbitrary string.
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    public limit: number,
    public windowMs: number
  ) {}

  /** Records a hit; returns retry-after seconds if the key is over its limit. */
  hit(key: string, now: number = Date.now()): { allowed: true } | { allowed: false; retryAfter: number } {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return { allowed: false, retryAfter: Math.max(1, Math.ceil((recent[0] + this.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true };
  }

  forget(key: string): void {
    this.hits.delete(key);
  }

  prune(now: number = Date.now()): void {
    for (const [key, times] of this.hits.entries()) {
      const recent = times.filter((t) => now - t < this.windowMs);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }

  reset(): void {
    this.hits.clear();
  }
}
