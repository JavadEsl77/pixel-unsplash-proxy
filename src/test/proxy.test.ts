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

test('allowed routes preserve query string and return upstream response', async () => {
  const calls: string[] = [];
  const server = createServer({ proxy: async (path) => {
    calls.push(path);
    return { status: 200, headers: { 'content-type': 'application/json; charset=utf-8', 'x-upstream': 'yes' }, body: Buffer.from('{"ok":true}') };
  } });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const res = await request(server, '/napi/search/photos?page=1&per_page=20&query=dota');
  assert.equal(res.status, 200);
  assert.deepEqual(calls, ['/napi/search/photos?page=1&per_page=20&query=dota']);
  assert.equal(res.body, '{"ok":true}');
  server.close();
});

test('health route is not proxied', async () => {
  const server = createServer({ proxy: async () => ({ status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from('{}') }) });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const res = await request(server, '/health');
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(res.body).ok, true);
  server.close();
});
