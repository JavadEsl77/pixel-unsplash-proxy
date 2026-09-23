import http, { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { loadConfig, type AppConfig } from './config.js';
import { isAllowedPath, proxyToUnsplash, proxyToUnsplashImages, type ProxyResult } from './proxy.js';
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
  proxyImage?: (pathWithQuery: string, userAgent: string, timeoutMs: number) => Promise<ProxyResult>;
  fetchImpl?: typeof fetch;
};

export const createServer = (options: CreateServerOptions = {}) => {
  const config = options.config ?? loadConfig();
  const limiter = new RateLimiter(config.rateLimitWindowMs, config.rateLimitMax);
  const proxy = options.proxy ?? proxyToUnsplash;
  const proxyImage = options.proxyImage ?? proxyToUnsplashImages;
  const fetchImpl = options.fetchImpl ?? fetch;
  const readUpdateJson = options.readUpdateJson ?? (() => readFile(path.join(process.cwd(), 'update.json'), 'utf8'));

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
    if (url.pathname.startsWith('/images/')) {
      if (options.proxyImage) {
        const upstream = await options.proxyImage(pathWithQuery.slice('/images'.length), config.userAgent, config.upstreamTimeoutMs);
        const headers: Record<string, string> = {};
        if (upstream.headers['content-type']) headers['content-type'] = upstream.headers['content-type'];
        if (upstream.headers['cache-control']) headers['cache-control'] = upstream.headers['cache-control'];
        res.writeHead(upstream.status, headers);
        return res.end(Buffer.from(upstream.body));
      }
      try {
        const upstream = await fetch(`https://images.unsplash.com${pathWithQuery.slice('/images'.length)}`, {
          method: 'GET',
          headers: { 'User-Agent': config.userAgent, Accept: '*/*' },
          redirect: 'follow',
          signal: AbortSignal.timeout(config.upstreamTimeoutMs),
        });
        const headers: Record<string, string> = {};
        if (upstream.headers.get('content-type')) headers['content-type'] = upstream.headers.get('content-type') as string;
        if (upstream.headers.get('cache-control')) headers['cache-control'] = upstream.headers.get('cache-control') as string;
        res.writeHead(upstream.status, headers);
        if (!upstream.body) return res.end();
        await pipeline(Readable.fromWeb(upstream.body as any), res);
        return;
      } catch {
        return json(res, 502, { ok: false, error: 'Upstream request failed' });
      }
    }
    if (!isAllowedPath(url.pathname)) return json(res, 404, { ok: false, error: 'Not found' });

    const upstream = await fetchImpl(`https://unsplash.com${pathWithQuery}`, {
      method: 'GET',
      headers: { 'User-Agent': config.userAgent, Accept: '*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(config.upstreamTimeoutMs),
    });
    const headers: Record<string, string> = {};
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower !== 'content-length' && lower !== 'content-encoding' && lower !== 'transfer-encoding' && lower !== 'connection' && lower !== 'keep-alive' && lower !== 'proxy-authenticate' && lower !== 'proxy-authorization' && lower !== 'te' && lower !== 'trailer' && lower !== 'upgrade') headers[key] = value;
    });
    res.writeHead(upstream.status, headers);
    if (!upstream.body) return res.end();
    await pipeline(Readable.fromWeb(upstream.body as any), res);
  });
};

export const start = async () => {
  const config = loadConfig();
  const server = createServer({ config });
  await new Promise<void>((resolve) => server.listen(config.port, resolve));
  return server;
};
