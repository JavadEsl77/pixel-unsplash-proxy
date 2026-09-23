import http, { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { loadConfig, type AppConfig } from './config.js';
import { isAllowedPath, proxyToUnsplash, type ProxyResult } from './proxy.js';
import { RateLimiter } from './rate-limit.js';

const json = (res: ServerResponse, statusCode: number, payload: unknown) => {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length });
  res.end(body);
};

const safeRemoteKey = (req: IncomingMessage) => req.socket.remoteAddress ?? 'unknown';

type CreateServerOptions = {
  config?: AppConfig;
  proxy?: (pathWithQuery: string, userAgent: string, timeoutMs: number) => Promise<ProxyResult>;
  readUpdateJson?: () => Promise<string>;
};

export const createServer = (options: CreateServerOptions = {}) => {
  const config = options.config ?? loadConfig();
  const limiter = new RateLimiter(config.rateLimitWindowMs, config.rateLimitMax);
  const proxy = options.proxy ?? proxyToUnsplash;
  const readUpdateJson = options.readUpdateJson ?? (() => readFile(new URL('../update.json', import.meta.url), 'utf8'));

  return http.createServer(async (req, res) => {
    const method = req.method ?? 'GET';
    const url = new URL(req.url ?? '/', 'http://localhost');
    const pathWithQuery = `${url.pathname}${url.search}`;

    res.setHeader('x-powered-by', 'pixel-unsplash-proxy');

    const limit = limiter.allow(safeRemoteKey(req));
    res.setHeader('x-rate-limit-limit', String(config.rateLimitMax));
    res.setHeader('x-rate-limit-remaining', String(limit.remaining));
    res.setHeader('x-rate-limit-reset', String(Math.ceil(limit.resetAt / 1000)));

    if (!limit.allowed) return json(res, 429, { ok: false, error: 'Rate limit exceeded' });
    if (method !== 'GET') return json(res, 405, { ok: false, error: 'Method not allowed' });
    if (url.pathname === '/health') return json(res, 200, { ok: true });
    if (url.pathname === '/pixel/update') {
      try {
        const body = await readUpdateJson();
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
        return res.end(body);
      } catch {
        return json(res, 500, { ok: false, error: 'Update metadata unavailable' });
      }
    }
    if (!isAllowedPath(url.pathname)) return json(res, 404, { ok: false, error: 'Not found' });

    const upstream = await proxy(pathWithQuery, config.userAgent, config.upstreamTimeoutMs);
    res.writeHead(upstream.status, upstream.headers);
    res.end(Buffer.from(upstream.body));
  });
};

export const start = async () => {
  const config = loadConfig();
  const server = createServer({ config });
  await new Promise<void>((resolve) => server.listen(config.port, resolve));
  return server;
};
