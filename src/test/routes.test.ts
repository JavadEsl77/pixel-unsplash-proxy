import assert from 'node:assert/strict';
import test from 'node:test';
import { isAllowedPath } from '../proxy.js';

test('random does not match photo id route', () => {
  assert.equal(isAllowedPath('/napi/photos/random'), true);
  assert.equal(isAllowedPath('/napi/photos/123'), true);
  assert.equal(isAllowedPath('/napi/photos/'), false);
});

test('only allowlisted endpoints are accepted', () => {
  assert.equal(isAllowedPath('/proxy?url=https://example.com'), false);
  assert.equal(isAllowedPath('/napi/search/photos'), true);
  assert.equal(isAllowedPath('/napi/topics/abc/photos'), true);
  assert.equal(isAllowedPath('/napi/topics/abc'), false);
});
