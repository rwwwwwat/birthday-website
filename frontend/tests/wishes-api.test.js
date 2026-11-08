import test from 'node:test';
import assert from 'node:assert/strict';
import { createWishesApi, wishesEndpoint, validReceipt, retryTime } from '../src/js/services/wishesApi.js';

const receipt = { wishId: 78, createdAt: '2026-11-01T00:30:21.1772829+00:00', isRead: false, source: '王若溪大王生日网站' };
const response = (status, value = {}, headers = {}) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', ...headers } });

test('API URL preserves gateway paths, accepts local dev and rejects credentials or unsafe schemes', () => {
  assert.equal(wishesEndpoint('https://example.test/gateway///'), 'https://example.test/gateway/api/wishes');
  assert.equal(wishesEndpoint('http://localhost:5270'), 'http://localhost:5270/api/wishes');
  for (const value of ['', '/api', 'javascript:alert(1)', 'https://name:secret@example.test', 'https://example.test?q=x', 'http://example.test']) assert.throws(() => wishesEndpoint(value));
});

test('single fetch sends content only and returns unmodified real 201 metadata', async () => {
  let calls = 0;
  const api = createWishesApi({ baseUrl: 'https://example.test/', fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, 'https://example.test/api/wishes');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(options.body), { content: '  希望每天开心  ' });
    assert.equal(options.credentials, 'same-origin'); assert.equal(options.redirect, 'error');
    return response(201, receipt);
  } });
  const result = await api.submit('  希望每天开心  ');
  assert.equal(result.status, 'success'); assert.deepEqual(result.receipt, receipt); assert.equal(calls, 1);
});

test('unconfigured API never attempts fetch', async () => {
  let calls = 0;
  const api = createWishesApi({ baseUrl: '', fetchImpl: () => { calls++; } });
  assert.equal((await api.submit('wish')).reason, 'configuration'); assert.equal(calls, 0);
});
for (const status of [401,403]) test('Access ' + status + ' prompts verification, retains manual-only submission and same-origin cookies',async()=>{
  let calls=0;
  const result=await createWishesApi({baseUrl:'https://example.test',fetchImpl:async(url,options)=>{
    ++calls;assert.equal(options.credentials,'same-origin');assert.equal(options.redirect,'error');return response(status);
  }}).submit('private draft');
  assert.equal(result.status,'error');assert.match(result.message,/重新验证/);assert.equal(calls,1);
});

for (const status of [400, 401, 403, 404, 405, 413, 415]) test('HTTP ' + status + ' is a clear rejection without echoing exception details', async () => {
  const result = await createWishesApi({ baseUrl: 'https://example.test', fetchImpl: async () => response(status, { detail: 'Server=SECRET; INSERT SQL user text' }) }).submit('wish');
  assert.equal(result.status, 'error'); assert.equal(result.canRetry, true); assert.equal(result.requiresConfirmation, false);
  assert.doesNotMatch(JSON.stringify(result), /SECRET|INSERT/);
});

test('429 respects Retry-After and never auto-retries', async () => {
  let calls = 0;
  const result = await createWishesApi({ baseUrl: 'https://example.test', now: () => 1000, fetchImpl: async () => { calls++; return response(429, {}, { 'Retry-After': '30' }); } }).submit('wish');
  assert.equal(result.retryAt, 31000); assert.equal(result.status, 'error'); assert.equal(calls, 1);
  assert.equal(retryTime('invalid', 1000), 61000);
});

test('503 is a service error requiring independent confirmation before resubmission', async () => {
  const result = await createWishesApi({ baseUrl: 'https://example.test', fetchImpl: async () => response(503) }).submit('wish');
  assert.equal(result.status, 'error'); assert.equal(result.requiresConfirmation, true); assert.equal(result.canRetry, false);
});

for (const status of [200, 408, 500, 502, 504]) test('HTTP ' + status + ' cannot establish that no database write happened', async () => {
  const result = await createWishesApi({ baseUrl: 'https://example.test', fetchImpl: async () => response(status) }).submit('wish');
  assert.equal(result.status, 'unknown'); assert.equal(result.canRetry, false);
});

test('network exception does not imply failure and triggers only one fetch', async () => {
  let calls = 0;
  const result = await createWishesApi({ baseUrl: 'https://example.test', fetchImpl: async () => { calls++; throw new TypeError('connection lost'); } }).submit('wish');
  assert.equal(result.status, 'unknown'); assert.equal(calls, 1);
});

test('timeout covers pending fetch and does not retry', async () => {
  let calls = 0;
  const result = await createWishesApi({ baseUrl: 'https://example.test', timeoutMs: 10, fetchImpl: () => { calls++; return new Promise(() => {}); } }).submit('wish');
  assert.equal(result.status, 'unknown'); assert.equal(result.reason, 'timeout'); assert.equal(calls, 1);
});

test('timeout also covers a stalled success-response body', async () => {
  const result = await createWishesApi({ baseUrl: 'https://example.test', timeoutMs: 10, fetchImpl: async () => ({ status: 201, json: () => new Promise(() => {}) }) }).submit('wish');
  assert.equal(result.status, 'unknown');
});

for (const value of [{ ...receipt, wishId: 0 }, { ...receipt, wishId: Number.MAX_SAFE_INTEGER + 1 }, { ...receipt, createdAt: 'yesterday' }, { ...receipt, createdAt: '2026-11-01T08:30:21+08:00' }, { ...receipt, isRead: true }, { ...receipt, source: null }]) {
  test('invalid 201 receipt remains unknown: ' + JSON.stringify(value), async () => {
    assert.equal(validReceipt(value), false);
    const result = await createWishesApi({ baseUrl: 'https://example.test', fetchImpl: async () => response(201, value) }).submit('wish');
    assert.equal(result.status, 'unknown');
  });
}
