import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { createServer } from '../server.js';

const request = (server: http.Server) => new Promise<{ status: number; body: string; headers: http.IncomingHttpHeaders }>((resolve, reject) => {
  const address = server.address();
  if (!address || typeof address === 'string') return reject(new Error('No address'));
  const req = http.request({ hostname: '127.0.0.1', port: address.port, path: '/napi/topics?page=1&per_page=20', method: 'GET' }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
  });
  req.on('error', reject);
  req.end();
});

test('large JSON bodies are forwarded without truncation', async () => {
  const big = JSON.stringify({ topics: Array.from({ length: 80 }, (_, i) => ({ id: `topic-${i}`, cover_photo: { urls: { full: `https://plus.unsplash.com/premium/photo-${i}` } } })) });
  const server = createServer({
    fetchImpl: async () => new Response(big, { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=60', 'content-length': String(big.length) } }),
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const res = await request(server);
  assert.equal(res.status, 200);
  assert.equal(res.headers['content-type'], 'application/json');
  assert.equal(JSON.parse(res.body).topics.length, 80);
  server.close();
});
