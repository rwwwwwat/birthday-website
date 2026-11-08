import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { startLocalMediaBackend, proxyMedia } from './local-media-server.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(root, '.local/phase10-5-mock-dist');
const shots = resolve(root, 'docs/screenshots/phase-10-5/api');
await mkdir(shots, { recursive: true });
// Never use a real API URL for POST browser tests. .invalid is intercepted below.
const apiOrigin = 'https://birthday-api.invalid';
const build = spawnSync(process.execPath, [resolve(root, 'frontend/node_modules/vite/bin/vite.js'), 'build', '--outDir', dist], {
  cwd: resolve(root, 'frontend'), env: { ...process.env, VITE_API_BASE_URL: apiOrigin }, encoding: 'utf8', windowsHide: true,
});
assert.equal(build.status, 0, build.stderr || build.stdout);
const mediaBackend = await startLocalMediaBackend();
const server = createServer(async (request, response) => {
  if (proxyMedia(request, response, mediaBackend.origin)) return;
  try {
    let path = new URL(request.url, 'http://localhost').pathname;
    if (path.startsWith('/birthday-test/')) path = path.slice('/birthday-test'.length);
    const filename = resolve(dist, '.' + (path === '/' ? '/index.html' : decodeURIComponent(path)));
    if (!filename.startsWith(dist + '\\')) { response.writeHead(403).end(); return; }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
    response.setHeader('Content-Type', types[extname(filename)] || 'application/octet-stream');
    response.end(await readFile(filename));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const profile = resolve(root, '.local/phase10-5-api-edge-' + Date.now());
await mkdir(profile, { recursive: true });
const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket, send, evaluate, mode = 'hold', serial = 0;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const posts = [], held = [], errors = [], expectedNetworkErrors = [], blockedUnexpected = [], checks = [];
const receipt = () => ({ wishId: 7000 + ++serial, createdAt: '2026-11-01T00:30:21.1772829+00:00', isRead: false, source: '王若溪大王生日网站' });
try {
  let port;
  for (let i = 0; i < 100; i++) { try { port = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await delay(200); } }
  assert.ok(port);
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const current = ++id, timer = setTimeout(() => { pending.delete(current); reject(new Error('CDP timeout: ' + method)); }, 10000);
    pending.set(current, (message) => { clearTimeout(timer); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); });
    socket.send(JSON.stringify({ id: current, method, params }));
  });
  const fulfill = (requestId, status, body, headers = {}) => send('Fetch.fulfillRequest', {
    requestId, responseCode: status,
    responseHeaders: Object.entries({ 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': base,
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Expose-Headers': 'Retry-After', ...headers }).map(([name, value]) => ({ name, value })),
    body: Buffer.from(status === 204 ? '' : JSON.stringify(body), 'utf8').toString('base64'),
  });
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(message.params.exceptionDetails));
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') {
      const value = message.params.entry;
      (value.url?.startsWith(apiOrigin) ? expectedNetworkErrors : errors).push(value.text + ' ' + value.url);
    }
    if (message.method === 'Fetch.requestPaused') {
      const { requestId, request } = message.params;
      void (async () => {
        if (request.url.startsWith(base + '/') && request.method === 'GET') { await send('Fetch.continueRequest', { requestId }); return; }
        if (request.url === apiOrigin + '/api/wishes') {
          if (request.method === 'OPTIONS') { await fulfill(requestId, 204, null); return; }
          if (request.method === 'POST') {
            posts.push({ mode, url: request.url, body: JSON.parse(request.postData) });
            if (mode === 'hold' || mode === 'timeout') { held.push(requestId); return; }
            if (mode === 'network') { await send('Fetch.failRequest', { requestId, errorReason: 'ConnectionFailed' }); return; }
            if (mode === '201') { await fulfill(requestId, 201, receipt()); return; }
            await fulfill(requestId, Number(mode), { title: 'mock problem', status: Number(mode) }, mode === '429' ? { 'Retry-After': '1' } : {});
            return;
          }
        }
        blockedUnexpected.push({ url: request.url, method: request.method });
        await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      })().catch((error) => errors.push(String(error)));
    }
  };
  evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async (expression) => {
    for (let i = 0; i < 440; i++) { if (await evaluate(expression)) return; await delay(50); }
    throw new Error('Wait failed: ' + expression);
  };
  const click = async (selector) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',behavior:'instant'})`); await delay(70);
    const point = await evaluate(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2-visualViewport.offsetLeft,y:r.top+r.height/2-visualViewport.offsetTop};})()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point }); await delay(50);
  };
  const navigateToWishes = async (path = '/') => {
    await send('Page.navigate', { url: base + path });
    await wait(`location.pathname===${JSON.stringify(path)} && !!document.querySelector('#login-form')`);
    await evaluate("document.querySelector('#code').value='1002';document.querySelector('#login-form').requestSubmit()");
    await wait("document.body.dataset.scene==='memories'"); await click('[data-chapter=wishes]');
    await wait("document.body.dataset.scene==='wishes'");
  };
  const reset = async () => {
    // These are test-only browser records: every POST was intercepted before transport.
    await evaluate("localStorage.removeItem('birthday.wishSubmission.v1');sessionStorage.removeItem('birthday.wishDraft.v1')");
    await navigateToWishes();
  };
  const enter = (text) => evaluate(`(() => {const e=document.querySelector('textarea');e.value=${JSON.stringify(text)};e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  const state = (value) => wait(`document.querySelector('.wish-feedback').dataset.state===${JSON.stringify(value)}`);
  const screenshot = async (name) => {
    await evaluate("window.scrollTo({top:0,behavior:'instant'})"); await delay(200);
    const { cssContentSize: content } = await send('Page.getLayoutMetrics');
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: content.width, height: Math.min(2200, content.height), scale: 1 } });
    await writeFile(resolve(shots, name), Buffer.from(shot.data, 'base64'));
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*://localhost:5270/*', '*://127.0.0.1:5270/*'] });
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await navigateToWishes();
  await enter('浏览器拦截测试 · 绝不写入数据库');
  await click('#wish-submit'); await state('submitting');
  await evaluate("for(let i=0;i<8;i++)document.querySelector('#wish-form').requestSubmit()");
  assert.equal(posts.length, 1); assert.equal(await evaluate("document.querySelector('#wish-submit').disabled"), true);
  assert.deepEqual(posts[0].body, { content: '浏览器拦截测试 · 绝不写入数据库' });
  await screenshot('01-submitting.png');
  await click('[data-chapter=cake]'); await wait("document.body.dataset.scene==='cake'");
  await click('[data-chapter=wishes]'); await wait("document.body.dataset.scene==='wishes'");
  assert.equal(await evaluate("document.querySelector('#wish-submit').disabled"), true); assert.equal(posts.length, 1);
  const confirmed = receipt(); await fulfill(held.shift(), 201, confirmed); await state('success');
  assert.equal(await evaluate("document.querySelector('textarea').value"), '');
  assert.match(await evaluate("document.querySelector('.wish-receipt').textContent"), new RegExp(String(confirmed.wishId)));
  assert.match(await evaluate("document.querySelector('time').textContent"), /2026-11-01T00:30:21.1772829\+00:00/);
  await screenshot('02-success-mock.png');
  await navigateToWishes(); await state('success'); assert.equal(posts.length, 1);
  checks.push('201 receipt, exact server timestamp, cleared draft, success reload, duplicate click and scene-change guard');
  await click('#wish-new'); mode = '400'; await enter('400草稿保留'); await click('#wish-submit'); await state('error');
  assert.equal(await evaluate("document.querySelector('textarea').value"), '400草稿保留');
  assert.equal(await evaluate("document.querySelector('#wish-retry').hidden"), false);
  mode = '201'; await click('#wish-retry'); await state('success');
  await click('#wish-new'); mode = '429'; await enter('429手动重试'); await click('#wish-submit'); await state('error');
  const beforeWait = posts.length; assert.equal(await evaluate("document.querySelector('#wish-retry').disabled"), true);
  await delay(1300); assert.equal(posts.length, beforeWait);
  await wait("!document.querySelector('#wish-retry').disabled"); mode = '201'; await click('#wish-retry'); await state('success');
  checks.push('400 retains draft and manual retry; 429 countdown, no automatic retry, then manual retry');
  await click('#wish-new'); mode = '503'; await enter('503需要独立核实'); await click('#wish-submit'); await state('error');
  assert.equal(await evaluate("document.querySelector('#wish-submit').disabled"), true);
  assert.equal(await evaluate("document.querySelector('#wish-retry').hidden"), true);
  const after503 = posts.length; await navigateToWishes(); await state('error'); assert.equal(posts.length, after503);
  assert.equal(await evaluate("document.querySelector('textarea').value"), '503需要独立核实');
  await screenshot('03-service-error-mock.png');
  await reset(); mode = 'network'; await enter('网络异常不等于没有保存'); await click('#wish-submit'); await state('unknown');
  const afterNetwork = posts.length; await navigateToWishes(); await state('unknown');
  await evaluate("document.querySelector('#wish-form').requestSubmit()"); await delay(200);
  assert.equal(posts.length, afterNetwork); assert.equal(await evaluate("document.querySelector('textarea').value"), '网络异常不等于没有保存');
  await screenshot('04-unknown-mock.png');
  checks.push('503 blocks resubmission across reload; network exception restores unknown + draft and refuses resubmit');
  await reset(); mode = 'timeout'; await enter('超时结果未知'); await click('#wish-submit'); await state('submitting');
  const timeoutCount = posts.length; await state('unknown'); assert.equal(posts.length, timeoutCount);
  for (const requestId of held.splice(0)) await send('Fetch.failRequest', { requestId, errorReason: 'Aborted' }).catch(() => {});
  await navigateToWishes('/birthday-test/'); await state('unknown'); assert.equal(posts.length, timeoutCount);
  for (const width of [320, 390, 1440]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: width === 1440 ? 1000 : 844, deviceScaleFactor: 1, mobile: width < 700 });
    assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true);
  }
  checks.push('real frontend timeout branch, no retry, reload + GitHub Pages subpath preserves uncertainty, responsive feedback');
  assert.deepEqual(blockedUnexpected, []); assert.deepEqual(errors, []);
  const result = { passed: true, checks, interceptedPostCount: posts.length, allPostTargets: [...new Set(posts.map((post) => post.url))], realApiPostCount: 0, unexpectedRequests: blockedUnexpected, unexpectedErrors: errors, expectedMockNetworkErrors: expectedNetworkErrors.length };
  await writeFile(resolve(root, '.local/phase10-5-api-browser-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  if (evaluate) console.error('PAGE_STATE', await evaluate("({scene:document.body.dataset.scene,text:document.body.innerText.slice(-1100)})").catch(() => null));
  throw error;
} finally {
  socket?.close(); server.closeAllConnections(); server.close();
  await mediaBackend.close();
  try {
    const active = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n');
    const browser = new WebSocket('ws://127.0.0.1:' + active[0] + active[1]);
    await new Promise((resolve, reject) => { browser.onopen = resolve; browser.onerror = reject; });
    browser.send(JSON.stringify({ id: 1, method: 'Browser.close' })); await delay(300); browser.close();
  } catch { edge.kill(); }
}
