export type AppConfig = {
  port: number;
  upstreamTimeoutMs: number;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  userAgent: string;
};

const toInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const loadConfig = (): AppConfig => ({
  port: toInt(process.env.PORT, 8080),
  upstreamTimeoutMs: toInt(process.env.UPSTREAM_TIMEOUT_MS, 8000),
  rateLimitWindowMs: toInt(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
  rateLimitMax: toInt(process.env.RATE_LIMIT_MAX, 120),
  userAgent: 'pixel-unsplash-proxy/1.0',
});
