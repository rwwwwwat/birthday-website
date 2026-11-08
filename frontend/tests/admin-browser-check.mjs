import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import assert from 'node:assert/strict';
const root = fileURLToPath(new URL('../../', import.meta.url));
const content = resolve(root,'backend/BirthdayWebsite.Api/wwwroot');
const shots = resolve(root,'docs/screenshots/phase-10-5/admin'); await mkdir(shots,{recursive:true});
const server = createServer(async (request,response) => {
  try {
    const path = new URL(request.url,'http://localhost').pathname;
    const file = resolve(content, '.' + (path === '/admin/' ? '/admin/index.html' : path));
    if (!file.startsWith(content + '\\')) { response.writeHead(403).end(); return; }
    response.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[extname(file)] || 'application/octet-stream');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'");
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const profile = resolve(root,'.local/phase10-5-admin-edge-' + Date.now()); await mkdir(profile,{recursive:true});
const edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', [
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-sync',
  '--remote-debugging-port=0','--user-data-dir=' + profile,'about:blank'],{windowsHide:true,stdio:'ignore'});
const delay = (ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const calls=[], errors=[], blocked=[], expectedErrors=[];
let socket, loggedIn=false, latest=65, fakeRead=false, holdNextStats=false, heldStats;
const rows=Array.from({length:25},(_,i)=>({wishId:65-i,createdAt:'2026-11-01T00:30:21.1772829+00:00',isRead:(65-i)%2===0,
  source:'浏览器隔离演示',contentPreview:'想要一份被认真收藏的小期待。', content:'【浏览器 Mock】希望每天都有值得期待的小美好。\n<script>window.UNSAFE=true</script>'}));
try {
  let port; for(let i=0;i<100;i++){try{port=(await readFile(resolve(profile,'DevToolsActivePort'),'utf8')).split('\n')[0];break;}catch{await delay(150);}}
  assert.ok(port); const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  socket=new WebSocket(targets.find((target)=>target.type==='page').webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  let id=0; const pending=new Map();
  const send=(method,params={})=>new Promise((resolve,reject)=>{const current=++id;
    const timer=setTimeout(()=>{pending.delete(current);reject(new Error(method+' timed out'));},10000);
    pending.set(current,(message)=>{clearTimeout(timer);message.error?reject(new Error(JSON.stringify(message.error))):resolve(message.result);});
    socket.send(JSON.stringify({id:current,method,params}));});
  const fulfill=(requestId,status,body)=>send('Fetch.fulfillRequest',{requestId,responseCode:status,
    responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(status===204?'':JSON.stringify(body),'utf8').toString('base64')});
  socket.onmessage=({data})=>{
    const message=JSON.parse(data); if(message.id){pending.get(message.id)?.(message);pending.delete(message.id);}
    if(message.method==='Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if(message.method==='Log.entryAdded'&&message.params.entry.level==='error'){
      const entry=message.params.entry; (entry.url?.includes('/api/admin/')?expectedErrors:errors).push(entry.text);
    }
    if(message.method==='Fetch.requestPaused'){
      const {requestId,request}=message.params;
      void(async()=>{
        const url=new URL(request.url);
        if(url.origin===base&&url.pathname.startsWith('/api/admin/')){
          calls.push({method:request.method,path:url.pathname,query:url.search});
          const path=url.pathname.slice('/api/admin/'.length);
          if(path==='csrf'){await fulfill(requestId,200,{token:'mock-csrf-only'});return;}
          if(request.method!=='GET')assert.equal(request.headers['X-CSRF-TOKEN']||request.headers['x-csrf-token'],'mock-csrf-only');
          if(path==='login'){
            const body=JSON.parse(request.postData); loggedIn=body.password==='mock-browser-only';
            await fulfill(requestId,loggedIn?200:401,loggedIn?{username:'收藏室管理员'}:{title:'登录失败'});return;
          }
          if(!loggedIn){await fulfill(requestId,401,{title:'未登录'});return;}
          if(path==='me'){await fulfill(requestId,200,{username:'收藏室管理员'});return;}
          if(path==='logout'){loggedIn=false;await fulfill(requestId,204,null);return;}
          if(path==='wishes/stats'){if(holdNextStats){holdNextStats=false;heldStats=requestId;return;}await fulfill(requestId,200,{totalCount:25,unreadCount:fakeRead?12:13,readCount:fakeRead?13:12,latestCreatedAt:rows[0].createdAt,latestWishId:latest});return;}
          if(path==='wishes'){
            const page=Number(url.searchParams.get('page')),size=Number(url.searchParams.get('pageSize'));
            let selected=rows;
            if(url.searchParams.get('unreadOnly')==='true')selected=rows.filter((r)=>!r.isRead);
            if(url.searchParams.get('isRead')==='true')selected=rows.filter((r)=>r.isRead);
            await fulfill(requestId,200,{items:selected.slice((page-1)*size,page*size).map(({content,...r})=>r),totalCount:selected.length,currentPage:page,pageSize:size,totalPages:Math.ceil(selected.length/size)});return;
          }
          const match=path.match(/^wishes\/(\d+)(\/read)?$/);
          if(match){const row=rows.find((r)=>r.wishId===Number(match[1]));if(match[2]){assert.equal(request.method,'PATCH');row.isRead=true;fakeRead=true;}await fulfill(requestId,row?200:404,row||{});return;}
          throw new Error('Unexpected mock route '+path);
        }
        if(url.origin===base&&request.method==='GET'&&url.pathname.startsWith('/admin/')){await send('Fetch.continueRequest',{requestId});return;}
        blocked.push({url:request.url,method:request.method});await send('Fetch.failRequest',{requestId,errorReason:'BlockedByClient'});
      })().catch((error)=>errors.push(String(error)));
    }
  };
  const evaluate=async(expression)=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const wait=async(expression)=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await delay(50);}throw new Error('Wait failed '+expression);};
  const click=async(selector)=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(100);};
  const shot=async(name)=>{await evaluate('window.scrollTo(0,0)');await delay(100);const result=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(resolve(shots,name),Buffer.from(result.data,'base64'));};
  await send('Page.enable');await send('Runtime.enable');await send('Log.enable');await send('Network.enable');await send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:base+'/admin/'});await wait("document.querySelector('#login-view')&&!document.querySelector('#login-view').hidden");await delay(250);await shot('01-login-desktop.png');
  await evaluate("document.querySelector('#username').value='mock-admin';document.querySelector('#password').value='wrong';document.querySelector('#login-form').requestSubmit()");
  await wait("document.querySelector('#login-message').textContent.includes('登录失败')");
  await click('#toggle-password');assert.equal(await evaluate("document.querySelector('#password').type"),'text');
  await evaluate("document.querySelector('#password').value='mock-browser-only';document.querySelector('#login-form').requestSubmit()");
  await wait("!document.querySelector('#dashboard').hidden&&document.querySelectorAll('.wish-row').length===20");await shot('02-dashboard-mock.png');
  await click('#next');await wait("document.querySelectorAll('.wish-row').length===5");await click('#previous');await wait("document.querySelectorAll('.wish-row').length===20");
  await click('[data-filter=unread]');await wait("document.querySelectorAll('.wish-row').length===13");
  await click('[data-filter=read]');await wait("document.querySelectorAll('.wish-row').length===12");
  await click('[data-filter=unread]');await wait("document.querySelectorAll('.wish-row').length===13");await click('.wish-row');
  await wait("!document.querySelector('#detail-view').hidden");assert.equal(fakeRead,false);assert.equal(await evaluate('window.UNSAFE'),undefined);
  assert.ok(await evaluate("document.querySelector('#detail-content').textContent.includes('<script>')"));await shot('03-detail-mock.png');
  await click('#mark-read');await wait("document.querySelector('#detail-status').textContent==='已读'");assert.equal(fakeRead,true);
  assert.equal(calls.filter((r)=>r.method==='PATCH').length,1);await click('#mark-read');assert.equal(calls.filter((r)=>r.method==='PATCH').length,1);
  await click('#back');await wait("!document.querySelector('#list-view').hidden");
  for(const width of [320,390,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await delay(100);assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),true,'overflow at '+width);if(width===390)await shot('04-dashboard-mobile-mock.png');}
  const statsCalls=()=>calls.filter((r)=>r.path.endsWith('/stats')).length;
  await evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))");
  const paused=statsCalls();await delay(12500);assert.equal(statsCalls(),paused);
  latest=66;await evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))");
  await wait("!document.querySelector('#notice').hidden");await click('#notice-close');
  await evaluate("document.dispatchEvent(new Event('visibilitychange'))");await delay(200);assert.equal(await evaluate("document.querySelector('#notice').hidden"),true);
  loggedIn=false;await evaluate("document.dispatchEvent(new Event('visibilitychange'))");await wait("document.querySelector('#dashboard').hidden");assert.equal(await evaluate("document.querySelector('#detail-content').textContent"),'');
  await evaluate("document.querySelector('#password').value='mock-browser-only';document.querySelector('#login-form').requestSubmit()");await wait("!document.querySelector('#dashboard').hidden");
  await delay(150); holdNextStats=true; await evaluate("document.dispatchEvent(new Event('visibilitychange'))");
  for(let i=0;i<100&&!heldStats;i++)await delay(20);assert.ok(heldStats);
  await click('#logout');await wait("document.querySelector('#dashboard').hidden");
  await evaluate("document.querySelector('#password').value='mock-browser-only';document.querySelector('#login-form').requestSubmit()");await wait("!document.querySelector('#dashboard').hidden");
  await fulfill(heldStats,401,{title:'expired old session'});await delay(200);assert.equal(await evaluate("document.querySelector('#dashboard').hidden"),false);
  await click('#logout');await wait("document.querySelector('#dashboard').hidden");const stopped=statsCalls();await evaluate("document.dispatchEvent(new Event('visibilitychange'))");await delay(200);assert.equal(statsCalls(),stopped);
  assert.deepEqual(errors,[]);assert.deepEqual(blocked,[]);
  const report={passed:true,checks:['login failure, password visibility, login, session expiry and logout; old-session late 401 cannot invalidate a new login','statistics, pagination, unread/read filters, details and text-only XSS rendering','manual mark-read only with CSRF; repeated disabled button cannot PATCH twice','12-second hidden-page pause, visible resume, ID reminder deduplication, logout stop','320/390/1440 layouts and screenshots'],mockAdminRequests:calls.length,mockPatchCount:calls.filter((r)=>r.method==='PATCH').length,realApiRequests:0,unexpectedErrors:errors,blockedUnexpectedRequests:blocked,expectedMockHttpErrors:expectedErrors.length};
  await writeFile(resolve(root,'.local/phase10-5-admin-browser-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{socket?.close();edge.kill();await new Promise((resolve)=>server.close(resolve));}
