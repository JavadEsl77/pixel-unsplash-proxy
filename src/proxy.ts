import { URL } from 'node:url';

export const allowedRoutes = [
  /^\/napi\/photos$/,
  /^\/napi\/search\/photos$/,
  /^\/napi\/photos\/random$/,
  /^\/napi\/photos\/[^/]+$/,
  /^\/napi\/topics$/,
  /^\/napi\/topics\/[^/]+\/photos$/,
  /^\/napi\/users\/[^/]+\/photos$/,
  /^\/nautocomplete\/[^/]+$/,
  /^\/napi\/search\/collections$/,
] as const;

export const isAllowedPath = (path: string) => allowedRoutes.some((route) => route.test(path));

export type ProxyResult = {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
};

const hopByHop = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'cookie',
  'authorization',
]);

const filterHeaders = (headers: Headers) => {
  const result: Record<string, string> = {};
  headers.forEach((value, key) => {
    if (!hopByHop.has(key.toLowerCase())) result[key] = value;
  });
  return result;
};

const requestUpstream = async (upstreamUrl: URL, userAgent: string, timeoutMs: number): Promise<ProxyResult> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(upstreamUrl, {
      method: 'GET',
      headers: { 'User-Agent': userAgent, Accept: '*/*' },
      redirect: 'follow',
      signal: controller.signal,
    });

    return { status: response.status, headers: filterHeaders(response.headers), body: new Uint8Array(await response.arrayBuffer()) };
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'Upstream request timed out' : 'Upstream request failed';
    return { status: 502, headers: { 'content-type': 'application/json; charset=utf-8' }, body: Buffer.from(JSON.stringify({ ok: false, error: message })) };
  } finally {
    clearTimeout(timeout);
  }
};

export const proxyToUnsplash = async (pathWithQuery: string, userAgent: string, timeoutMs: number): Promise<ProxyResult> => {
  return requestUpstream(new URL(`https://unsplash.com${pathWithQuery}`), userAgent, timeoutMs);
};

export const proxyToUnsplashImages = async (pathWithQuery: string, userAgent: string, timeoutMs: number): Promise<ProxyResult> => {
  return requestUpstream(new URL(`https://images.unsplash.com${pathWithQuery}`), userAgent, timeoutMs);
};
