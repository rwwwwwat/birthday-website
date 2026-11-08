import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
import { letterCopy, birthdayCopy } from '../src/config/copy.js';
import { startLocalMediaBackend, proxyMedia } from './local-media-server.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(root, 'frontend/dist');
const shots = resolve(root, 'docs/screenshots/phase-10-5');
await mkdir(shots, { recursive: true });
const profile = resolve(root, '.local', 'phase10-5-edge-' + Date.now());
await mkdir(profile, { recursive: true });
const mediaBackend = await startLocalMediaBackend();
const server = createServer(async (request, response) => {
  if (proxyMedia(request, response, mediaBackend.origin)) return;
  try {
    let path = new URL(request.url, 'http://localhost').pathname;
    if (path.startsWith('/birthday-test/')) path = path.slice('/birthday-test'.length);
    const filename = resolve(dist, '.' + (path === '/' ? '/index.html' : decodeURIComponent(path)));
    if (!filename.startsWith(dist + '\\')) { response.writeHead(403).end(); return; }
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg' };
    response.setHeader('Content-Type', types[extname(filename)] || 'application/octet-stream');
    const bytes = await readFile(filename); response.setHeader('Accept-Ranges', 'bytes');
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
    if (range) {
      const start = Number(range[1]), end = Math.min(Number(range[2] || bytes.length - 1), bytes.length - 1);
      if (start > end || start >= bytes.length) { response.writeHead(416).end(); return; }
      response.writeHead(206, { 'Content-Range': 'bytes ' + start + '-' + end + '/' + bytes.length, 'Content-Length': end - start + 1 });
      response.end(bytes.subarray(start, end + 1));
    } else response.end(bytes);
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const previewUrl = 'http://127.0.0.1:' + server.address().port;
let baseUrl = mediaBackend.origin; // Main regression uses the actual ASP.NET private-site source.
const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--mute-audio', '--autoplay-policy=document-user-activation-required',
  '--disable-background-networking', '--disable-sync', '--remote-debugging-port=0',
  '--user-data-dir=' + profile, 'about:blank',
], { windowsHide: true, stdio: 'ignore' });
let socket, port, send, evaluate;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errors = [], apiRequests = [];
const checks = [];
try {
  for (let i = 0; i < 100; i++) {
    try { port = (await readFile(resolve(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; }
    catch { await delay(200); }
  }
  assert.ok(port, 'Edge debugging port ready');
  const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  socket = new WebSocket(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let id = 0;
  const pending = new Map();
  socket.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) { pending.get(message.id)?.(message); pending.delete(message.id); }
    if (message.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(message.params.exceptionDetails));
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry.text + ' ' + message.params.entry.url);
    if (message.method === 'Network.requestWillBeSent' && /\/api\//.test(message.params.request.url)) apiRequests.push(message.params.request.url);
  };
  send = (method, params = {}) => new Promise((resolve, reject) => {
    const current = ++id;
    const timer = setTimeout(() => { pending.delete(current); reject(new Error('CDP timeout: ' + method)); }, 10000);
    pending.set(current, (message) => { clearTimeout(timer); message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result); });
    socket.send(JSON.stringify({ id: current, method, params }));
  });
  evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async (expression, label = expression) => {
    for (let i = 0; i < 160; i++) { if (await evaluate(expression)) return; await delay(50); }
    throw new Error('Wait failed: ' + label);
  };
  const click = async (selector) => {
    await evaluate(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'center',behavior:'instant'})`);
    await delay(100);
    const point = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e) throw new Error('Missing selector'); const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2};})()`);
    const hit = await evaluate(`(() => {const e=document.elementFromPoint(${point.x},${point.y});return {tag:e?.tagName,id:e?.id,cls:e?.className,viewport:{x:visualViewport.offsetLeft,y:visualViewport.offsetTop,scale:visualViewport.scale},scrollY};})()`);
    const visualPoint = { x: point.x - hit.viewport.x, y: point.y - hit.viewport.y };
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...visualPoint });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...visualPoint });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...visualPoint });
    await delay(80);
  };
  const scene = async (name) => {
    await wait("!document.querySelector('#scene-transition').classList.contains('is-active')");
    await click('[data-chapter="' + name + '"]');
    await wait(`document.body.dataset.scene===${JSON.stringify(name)} && !document.querySelector('#scene-transition').classList.contains('is-active')`);
  };
  const size = (width, height = 844) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 700 });
  const screenshot = async (filename) => {
    await evaluate("window.scrollTo({top:0,behavior:'instant'})");
    await delay(700);
    const metrics = await send('Page.getLayoutMetrics');
    const content = metrics.cssContentSize;
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: content.width, height: Math.min(content.height, 2200), scale: 1 } });
    await writeFile(resolve(shots, filename), Buffer.from(result.data, 'base64'));
  };
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable'); await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['*://localhost:5270/*', '*://127.0.0.1:5270/*'] });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__micMode='denied';window.__stoppedTracks=0;window.__micCalls=0;
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
      window.__micCalls++;
      if(window.__micMode==='denied')throw new DOMException('Test denial','NotAllowedError');
      if(window.__micMode==='pending')return await new Promise(resolve=>{window.__resolveMic=()=>resolve({getTracks:()=>[{stop:()=>{window.__stoppedTracks++}}]})});
      const ctx=new AudioContext();await ctx.resume();const dest=ctx.createMediaStreamDestination();
      const buffer=ctx.createBuffer(1,ctx.sampleRate,ctx.sampleRate);const samples=buffer.getChannelData(0);
      for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
      const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
      const gain=ctx.createGain();gain.gain.value=.001;source.connect(gain);gain.connect(dest);source.start();window.__micGain=gain;
      const track=dest.stream.getAudioTracks()[0],stop=track.stop.bind(track);
      track.stop=()=>{window.__stoppedTracks++;stop();source.stop();void ctx.close()};return dest.stream;
    }});
  ` });
  await size(390);
  await send('Page.navigate', { url: baseUrl + '/' });
  await wait("!!document.querySelector('#login-form')");
  await wait("document.querySelector('.avatar').complete && document.querySelector('.avatar').naturalWidth>0");
  await delay(650);
  assert.equal(await evaluate("document.querySelector('#account').value"), '宝宝');
  assert.equal(await evaluate("document.querySelector('#code').inputMode"), 'numeric');
  await screenshot('01-login-mobile.png');
  await wait("document.querySelector('#music-panel').dataset.status==='blocked'");
  assert.equal(await evaluate("document.querySelector('#site-audio').volume"), .15);
  await click('.music-toggle');
  await wait("!document.querySelector('#site-audio').paused && document.querySelector('#music-panel').dataset.status==='playing'");
  await evaluate("window.__originalAudio=document.querySelector('#site-audio')");
  await evaluate("Promise.all([...document.querySelectorAll('.music-collection img')].map(i=>i.decode()))");
  assert.equal(await evaluate("document.querySelectorAll('.music-collection img').length"),4);
  const expectedTracks = [['cry-for-me',303.046],['aitaiwa',268.382],['danger',206.08],['kataomoi',207.438]];
  for (const [id,duration] of expectedTracks) {
    await click('[data-track="' + id + '"]');
    await wait(`document.querySelector('#music-panel').dataset.track===${JSON.stringify(id)} && document.querySelector('#site-audio').readyState>=1 && Math.abs(document.querySelector('#site-audio').duration-${duration})<.5`);
    assert.ok(await evaluate(`document.querySelector('.current-cover').src.endsWith('/media/covers/'+${JSON.stringify(id)})`));
    assert.equal(await evaluate("document.querySelector('#site-audio').volume"),.15);
  }
  await wait("!document.querySelector('#site-audio').paused");
  await evaluate("document.querySelector('#site-audio').currentTime=document.querySelector('#site-audio').duration-.18");
  await wait("document.querySelector('#music-panel').dataset.track==='cry-for-me' && !document.querySelector('#site-audio').paused");
  await click('#music-play'); assert.equal(await evaluate("document.querySelector('#site-audio').paused"),true);
  await click('#music-play'); await wait("!document.querySelector('#site-audio').paused");
  await evaluate("const progress=document.querySelector('#music-progress');progress.value=32;progress.dispatchEvent(new Event('input',{bubbles:true}))");
  await screenshot('00-music-mobile.png'); await click('.music-close');
  checks.push('real MP3 decoding/durations and all four cover mappings; autoplay blocked then trusted gesture; 15% volume, pause/resume, track selection and playlist wrap');
  await click('#show-code'); assert.equal(await evaluate("document.querySelector('#code').type"), 'text');
  await click('#show-code');
  await evaluate("document.querySelector('#code').value='0000';document.querySelector('#login-form').requestSubmit()");
  assert.match(await evaluate("document.querySelector('#login-error').textContent"), /不对/);
  await evaluate("document.querySelector('#code').value='1002';document.querySelector('#login-form').requestSubmit()");
  await wait("document.body.dataset.scene==='memories' && !document.querySelector('#scene-transition').classList.contains('is-active')");
  assert.equal(await evaluate("[...document.querySelectorAll('[data-photo]')].filter(e=>!e.hidden).length"), 1);
  assert.match(await evaluate("document.querySelector('#day-counter').textContent"), /在一起第 \d+ 天/);
  await click('[data-photo="1"]'); await wait("document.querySelector('dialog').open"); await delay(450);
  await wait("document.querySelector('#music-panel').dataset.mode==='special' && document.querySelector('#site-audio').readyState>=1 && !document.querySelector('#site-audio').paused");
  assert.equal(await evaluate("document.querySelector('#music-panel').dataset.track"),'danger');
  assert.ok(await evaluate("document.querySelector('#site-audio').currentTime<3"));
  await click('.dialog-close'); await wait("!document.querySelector('dialog').open");
  const eggTime = await evaluate("document.querySelector('#site-audio').currentTime");
  await click('[data-photo="1"]'); await wait("document.querySelector('dialog').open"); await delay(450);
  assert.ok(await evaluate("document.querySelector('#site-audio').currentTime")>=eggTime);
  await click('.dialog-close'); await wait("!document.querySelector('dialog').open");
  await click('#show-memories');
  await delay(450);
  assert.equal(await evaluate("document.querySelector('#photo-stage').dataset.phase"), 'traveling');
  await wait("document.querySelector('#photo-stage').dataset.phase==='complete'");
  assert.equal(await evaluate("Promise.all([...document.querySelectorAll('[data-photo] img')].map(i=>i.decode())).then(()=>document.querySelectorAll('[data-photo]').length)"), 10);
  await screenshot('02-memories-mobile.png');
  for (let photo = 1; photo <= 10; photo++) {
    await click('[data-photo="' + photo + '"]'); await wait("document.querySelector('dialog').open"); await delay(400);
    await click('.dialog-close'); await wait("!document.querySelector('dialog').open");
    assert.equal(await evaluate("document.querySelectorAll('.is-lifted').length"), 0);
  }
  await click('#show-memories'); await wait("document.querySelector('#photo-stage').dataset.phase==='complete'");
  await click('[data-category=meals]'); assert.equal(await evaluate("document.querySelectorAll('.train-photo:not(.is-category-muted)').length"),4);
  await click('[data-category=all]');
  await evaluate("document.querySelector('#site-audio').currentTime=document.querySelector('#site-audio').duration-.18");
  await wait("document.querySelector('#music-panel').dataset.mode==='normal' && document.querySelector('#music-panel').dataset.track==='aitaiwa'");
  await click('.music-toggle'); await click('[data-track=cry-for-me]');
  await wait("document.querySelector('#site-audio').readyState>=1 && document.querySelector('#site-audio').currentTime>=31");
  assert.ok(await evaluate("document.querySelector('#site-audio').currentTime<45"));
  await click('.music-close'); await click('[data-photo="1"]'); await wait("document.querySelector('dialog').open"); await delay(400);
  assert.equal(await evaluate("document.querySelector('#music-panel').dataset.mode"),'normal');
  await click('.dialog-close'); await wait("!document.querySelector('dialog').open");
  await evaluate("document.querySelector('#site-audio').currentTime=document.querySelector('#site-audio').duration-.18");
  await wait("document.querySelector('#music-panel').dataset.track==='aitaiwa'");
  await click('[data-photo="1"]'); await wait("document.querySelector('dialog').open"); await delay(400);
  assert.equal(await evaluate("document.querySelector('#music-panel').dataset.mode"),'special');
  await click('.dialog-close'); await wait("!document.querySelector('dialog').open");
  await click('.music-toggle'); await click('[data-track=kataomoi]'); await wait("document.querySelector('#music-panel').dataset.mode==='normal'"); await click('.music-close');
  checks.push('first photo special starts at zero; close/reopen keeps playing; completion resumes next ordinary track; bookmark retained; no immediate repeat; manual switch exits special');
  checks.push('login, animated train, 10 physical photo clicks/dialog return, replay and all images');
  await scene('letter'); await click('#open-letter'); await wait("!document.querySelector('#letter-paper').hidden && document.querySelector('#letter-content').textContent.length>0");
  assert.equal(await evaluate("document.querySelector('.envelope').classList.contains('is-opening')"), true);
  await click('#skip-letter'); await screenshot('03-letter-mobile.png');
  assert.equal(await evaluate("document.querySelector('#letter-content').textContent"),letterCopy.text);
  assert.equal(await evaluate("document.querySelector('#site-audio')===window.__originalAudio"),true);
  await click('#replay-letter'); assert.equal(await evaluate("document.querySelector('#letter-paper').hidden"), true);
  await click('#open-letter'); await delay(200); await scene('cake');
  assert.equal(await evaluate("document.querySelector('.number-candles text').textContent.trim()"), '20');
  await screenshot('04-cake-mobile.png');
  assert.equal(await evaluate('window.__micCalls'), 0);
  await click('#make-wish'); await click('#start-mic'); await wait("document.querySelector('#mic-status').textContent.includes('未授权')");
  await click('#blow-candle'); assert.equal(await evaluate("document.querySelector('.birthday-blessing').hidden"),true);
  await wait("document.querySelector('.cake-stage').classList.contains('is-extinguished') && !document.querySelector('[data-scene=wishes]').disabled");
  assert.equal(await evaluate("document.querySelector('.birthday-blessing p').textContent"),birthdayCopy.blessing);
  await screenshot('04-cake-celebration.png');
  await click('#reset-cake'); await click('#make-wish');
  await evaluate("window.__micMode='quiet'"); await click('#start-mic');
  await wait("document.querySelector('#mic-status').textContent.includes('持续吹气')");
  await scene('wishes'); assert.equal(await evaluate('window.__stoppedTracks'), 1);
  await scene('cake'); await evaluate("window.__micMode='pending'"); await click('#start-mic');
  await scene('wishes'); await evaluate('window.__resolveMic()'); await wait('window.__stoppedTracks===2');
  await scene('cake'); await evaluate("window.__micMode='quiet'"); await click('#start-mic');
  await wait("document.querySelector('#mic-status').textContent.includes('持续吹气')");
  await evaluate('window.__micGain.gain.value=.4');
  await wait("document.querySelector('.cake-stage').classList.contains('is-extinguished')");
  await wait('window.__stoppedTracks===3');
  checks.push('envelope, typing/skip/replay, 20 candles, click fallback, mic denial, active/pending cleanup, synthetic broadband blow');
  await scene('wishes');
  await evaluate("const input=document.querySelector('#wish-content');input.value='给20岁的自己写一点小心愿 ♡';input.dispatchEvent(new Event('input',{bubbles:true}))");
  assert.equal(await evaluate("document.querySelector('#wish-count').textContent"), '给20岁的自己写一点小心愿 ♡'.length + ' / 2000');
  // The default production build deliberately has no localhost API address.
  assert.equal(await evaluate("document.querySelector('#wish-submit').disabled"), true);
  assert.match(await evaluate("document.querySelector('#submission-note').textContent"), /尚未配置/);
  await click('.feedback-preview summary'); await click('[data-preview=success]');
  assert.match(await evaluate("document.querySelector('.preview-feedback').textContent"), /没有发送/);
  await screenshot('05-wishes-mobile.png');
  await scene('cake'); await scene('wishes');
  assert.equal(await evaluate("document.querySelector('textarea').value"), '给20岁的自己写一点小心愿 ♡');
  for (const width of [320, 390, 1440]) {
    await size(width, width === 1440 ? 1000 : 844);
    for (const name of ['login','memories','letter','cake','wishes']) {
      await scene(name);
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, 'horizontal overflow: ' + name + ' at ' + width);
      if (name === 'login') {
        await click('.music-toggle');
        assert.equal(await evaluate("(()=>{const r=document.querySelector('#music-panel').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1})()"),true);
        if (width===1440) await screenshot('00-music-desktop.png'); await click('.music-close');
      }
      if (width === 1440 && name === 'login') await screenshot('01-login-desktop.png');
      if (width === 320 && name === 'memories') await screenshot('02-memories-320.png');
    }
  }
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await scene('memories'); await click('#show-memories'); await wait("document.querySelector('#photo-stage').dataset.phase==='complete'");
  await scene('letter'); await click('#replay-letter'); await click('#open-letter'); await wait("!document.querySelector('#skip-letter').hidden===false");
  checks.push('draft across scenes, unconfigured production form cannot POST, labelled success preview, 320/390/1440 layouts, reduced motion');
  await size(390);
  await send('Page.navigate', { url: baseUrl + '/' });
  await wait("!!document.querySelector('#login-form')");
  await evaluate("document.querySelector('#code').value='1002';document.querySelector('#login-form').requestSubmit()");
  await wait("document.body.dataset.scene==='memories'"); await scene('wishes');
  assert.equal(await evaluate("document.querySelector('textarea').value"), '给20岁的自己写一点小心愿 ♡');
  baseUrl = previewUrl; // Preserve the existing static-subpath compatibility check too.
  // Storage belongs to an origin: populate this separate preview origin through its real UI.
  await send('Page.navigate', { url: baseUrl + '/' });
  await wait("!!document.querySelector('#login-form')");
  await evaluate("document.querySelector('#code').value='1002';document.querySelector('#login-form').requestSubmit()");
  await wait("document.body.dataset.scene==='memories'"); await scene('wishes');
  await evaluate("const input=document.querySelector('#wish-content');input.value='给20岁的自己写一点小心愿 ♡';input.dispatchEvent(new Event('input',{bubbles:true}))");
  await send('Page.navigate', { url: baseUrl + '/birthday-test/' });
  await wait("location.pathname==='/birthday-test/' && !!document.querySelector('#login-form')");
  await evaluate("document.querySelector('#code').value='1002';document.querySelector('#login-form').requestSubmit()");
  await wait("document.body.dataset.scene==='memories'");
  await click('#show-memories'); await wait("document.querySelector('#photo-stage').dataset.phase==='complete'");
  await evaluate("Promise.all([...document.querySelectorAll('[data-photo] img')].map(i=>i.decode()))");
  await scene('wishes');
  assert.equal(await evaluate("document.querySelector('textarea').value"), '给20岁的自己写一点小心愿 ♡');
  await click('.music-toggle'); await evaluate("Promise.all([...document.querySelectorAll('.music-collection img')].map(i=>i.decode()))");
  await wait("document.querySelector('#site-audio').readyState>=1");
  assert.ok(await evaluate("document.querySelector('#site-audio').currentSrc.includes('/media/audio/')")); await click('.music-close');
  assert.deepEqual(apiRequests, []); assert.deepEqual(errors, []);
  checks.push('session draft reload, GitHub Pages subpath, no API requests, no JS/resource errors');
  await writeFile(resolve(root, '.local/phase10-5-regression-result.json'), JSON.stringify({ passed: true, checks, errors, apiRequests, screenshotDirectory: shots }, null, 2));
  console.log(JSON.stringify({ passed: true, checks, errors, apiRequests, screenshotDirectory: shots }, null, 2));
} catch (error) {
  if (send) {
    try { const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }); await writeFile(resolve(root, '.local/phase6-failure.png'), Buffer.from(shot.data, 'base64')); } catch {}
  }
  console.error('PAGE_STATE', evaluate ? await evaluate("({scene:document.body.dataset.scene,title:document.title,errors:document.body.innerText.slice(-700)})").catch(() => null) : null);
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
