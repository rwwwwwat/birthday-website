import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, preview } from 'vite';
import { startLocalMediaBackend } from './local-media-server.mjs';
import { publicAssets, assertPrivateMediaAbsent } from '../scripts/private-media.js';
const root = fileURLToPath(new URL('../../', import.meta.url));
const backend = await startLocalMediaBackend();
const previousTarget = process.env.MEDIA_PROXY_TARGET;
process.env.MEDIA_PROXY_TARGET = backend.origin;
let development, built;
const checks = [];
try {
  development = await createServer({ root: resolve(root,'frontend'), configFile: resolve(root,'frontend/vite.config.js'), server: { host:'127.0.0.1',port:0,strictPort:false }, logLevel:'error' });
  await development.listen();
  built = await preview({ root: resolve(root,'frontend'), configFile: resolve(root,'frontend/vite.config.js'), preview: { host:'127.0.0.1',port:0,strictPort:false }, logLevel:'error' });
  for (const [name, server] of [['development',development],['preview',built]]) {
    const origin='http://127.0.0.1:'+server.httpServer.address().port;
    for (const kind of ['audio','covers']) for (const id of ['cry-for-me','aitaiwa','danger','kataomoi']) {
      const url=origin+'/media/'+kind+'/'+id;
      const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.ok(Number(head.headers.get('content-length'))>0);
      assert.equal(head.headers.get('cache-control'),'private, no-store');
      const range=await fetch(url,{headers:{Range:'bytes=0-1'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,2);
    }
    const refused=await fetch(origin+'/media/audio/cry-for-me',{headers:{'X-Forwarded-For':'203.0.113.10'}});assert.equal(refused.status,401);
    const rawPaths=['/audio/Cry%20For%20Me.Feat.%20%E6%84%9B%E6%B5%B7.-Michita%232CbowT.mp3','/public/audio/test.jpg',
      '/%61udio/test.mp3','/@fs/F:/ourweb/audio/test.mp3','/audio/test.jpg?raw'];
    for(const path of rawPaths) assert.ok([403,404].includes((await fetch(origin+path)).status),'raw path exposed: '+name+path);
    for(const path of publicAssets)assert.equal((await fetch(origin+'/'+path,{method:'HEAD'})).status,200,'missing public asset '+path);
    checks.push(name+': all eight protected resources GET/HEAD/206, forwarded request denied, old/raw/@fs URLs blocked, eleven photos + favicon retained');
  }
  await assertPrivateMediaAbsent(resolve(root,'frontend/dist'));
  assert.equal((await readFile(resolve(root,'frontend/dist/index.html'),'utf8')).includes('site-audio'),false); // Player remains code-created.
  const report={passed:true,checks,realWishPostCount:0,realWishPatchCount:0,databaseEnabled:false,distPrivateMediaPresent:false};
  await writeFile(resolve(root,'.local/phase10-5-media-boundary-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
} finally {
  await development?.close();
  if(built){built.httpServer.closeAllConnections();await new Promise((resolve)=>built.httpServer.close(resolve));}
  await backend.close();
  if(previousTarget===undefined)delete process.env.MEDIA_PROXY_TARGET;else process.env.MEDIA_PROXY_TARGET=previousTarget;
}
