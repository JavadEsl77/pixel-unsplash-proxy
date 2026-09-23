type Bucket = { count: number; resetAt: number };

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly windowMs: number, private readonly max: number) {}

  allow(key: string) {
    const now = Date.now();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: this.max - 1, resetAt: now + this.windowMs };
    }
    if (current.count >= this.max) return { allowed: false, remaining: 0, resetAt: current.resetAt };
    current.count += 1;
    return { allowed: true, remaining: this.max - current.count, resetAt: current.resetAt };
  }
}
