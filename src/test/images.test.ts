import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { createServer } from '../server.js';

const request = (server: http.Server, path: string) => new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
  const address = server.address();
  if (!address || typeof address === 'string') return reject(new Error('No address'));
  const req = http.request({ hostname: '127.0.0.1', port: address.port, path, method: 'GET' }, (res) => {
    const chunks: Buffer[] = [];
    res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8'), headers: res.headers }));
  });
  req.on('error', reject);
  req.end();
});

test('images route proxies to images.unsplash.com and preserves query', async () => {
  const calls: string[] = [];
  const server = createServer({
    proxyImage: async (path) => {
      calls.push(path);
      return { status: 200, headers: { 'content-type': 'image/jpeg', 'cache-control': 'public, max-age=31536000' }, body: Buffer.from('image-bytes') };
    },
    proxy: async () => ({ status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{}') }),
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const res = await request(server, '/images/photo-123.jpg?w=400&q=80');
  assert.equal(res.status, 200);
  assert.deepEqual(calls, ['/photo-123.jpg?w=400&q=80']);
  assert.equal(res.body, 'image-bytes');
  assert.equal(res.headers['content-type'], 'image/jpeg');
  assert.equal(res.headers['cache-control'], 'public, max-age=31536000');
  server.close();
});

test('non-image arbitrary URLs are not proxied', async () => {
  const server = createServer({
    proxyImage: async () => ({ status: 200, headers: { 'content-type': 'image/jpeg' }, body: Buffer.from('x') }),
    proxy: async () => ({ status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{}') }),
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const res = await request(server, '/proxy?url=https://example.com');
  assert.equal(res.status, 404);
  server.close();
});
