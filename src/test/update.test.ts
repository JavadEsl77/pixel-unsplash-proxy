import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { createServer } from '../server.js';

const request = (server: http.Server, path: string) => new Promise<{ status: number; body: string }>((resolve, reject) => {
  const address = server.address();
  if (!address || typeof address === 'string') return reject(new Error('No address'));
  const req = http.request({ hostname: '127.0.0.1', port: address.port, path, method: 'GET' }, (res) => {
    let body = '';
    res.setEncoding('utf8');
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
  });
  req.on('error', reject);
  req.end();
});

test('pixel update endpoint returns update metadata', async () => {
  const server = createServer({
    proxy: async () => ({ status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{}') }),
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const res = await request(server, '/pixel/update');
  assert.equal(res.status, 200);
  const parsed = JSON.parse(res.body);
  assert.equal(parsed.data.versionCode, 9);
  assert.equal(parsed.data.versionName, '1.3.3');
  assert.equal(parsed.data.message, 'نسخه جدید Pixel منتشر شد.');
  assert.equal(parsed.data.isForce, false);
  assert.equal(parsed.data.ignoreButtonText, 'بعداً');
  assert.equal(parsed.data.splashImageUrl, '');
  assert.equal(parsed.data.links[0].text, 'دانلود از بازار');
  assert.equal(parsed.data.links[0].url, 'https://cafebazaar.ir/');
  server.close();
});

test('health and proxy routes still work', async () => {
  const calls: string[] = [];
  const server = createServer({
    proxy: async (path) => {
      calls.push(path);
      return { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, body: Buffer.from('{"ok":true}') };
    },
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const health = await request(server, '/health');
  const proxyRes = await request(server, '/napi/search/photos?page=1&per_page=20&query=dota');
  assert.equal(health.status, 200);
  assert.equal(JSON.parse(health.body).ok, true);
  assert.equal(proxyRes.status, 200);
  assert.deepEqual(calls, ['/napi/search/photos?page=1&per_page=20&query=dota']);
  server.close();
});
