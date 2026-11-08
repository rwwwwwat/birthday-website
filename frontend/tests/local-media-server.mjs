import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { request as httpRequest } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { access } from 'node:fs/promises';
const root = fileURLToPath(new URL('../../', import.meta.url));
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function startLocalMediaBackend() {
  const binary = resolve(root, '.local/phase10-5-artifacts/bin/BirthdayWebsite.Api/debug/BirthdayWebsite.Api.dll');
  await access(binary);
  const reservation = createServer(); await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise((resolve) => reservation.close(resolve));
  const origin = 'http://127.0.0.1:' + port;
  // Dedicated process: real SQL disabled before any request. Never stop the user's :5270 API.
  const process = spawn('dotnet', [binary], { cwd: resolve(root, 'backend/BirthdayWebsite.Api'), windowsHide: true, stdio: 'ignore',
    env: { ...globalThis.process.env, ASPNETCORE_ENVIRONMENT: 'Development', ASPNETCORE_URLS: origin,
      DatabaseProvider: 'SqlServer', Database__Enabled: 'false', Admin__Username: '', Admin__PasswordHash: '', Media__AllowDevelopmentLoopback: 'true',
      MediaStorage__Provider: 'Local', AzureBlob__ServiceUri: '',
      CloudflareAccess__AllowDevelopmentLoopback: 'true', CloudflareAccess__TeamDomain: '', CloudflareAccess__Audience: '',
      CloudflareAccess__AllowedEmails__0: '', CloudflareAccess__AllowedEmails__1: '' } });
  const close = async () => { if (process.exitCode === null) { process.kill(); await Promise.race([new Promise((resolve) => process.once('exit', resolve)), pause(3000)]); } };
  try {
    for (let i = 0; i < 100; i++) {
      if (process.exitCode !== null) throw new Error('Isolated media backend exited: ' + process.exitCode);
      try { if ((await fetch(origin + '/media/covers/cry-for-me', { method: 'HEAD', signal: AbortSignal.timeout(500) })).status === 200) return { origin, close }; } catch { /* Await startup. */ }
      await pause(100);
    }
    throw new Error('Isolated media backend did not become ready');
  } catch (error) { await close(); throw error; }
}
export function proxyMedia(request, response, origin) {
  if (!new URL(request.url, 'http://localhost').pathname.startsWith('/media/')) return false;
  if (!['GET','HEAD'].includes(request.method)) { response.writeHead(405).end(); return true; }
  const target = new URL(request.url, origin);
  const upstream = httpRequest(target, { method: request.method, headers: { ...request.headers, host: target.host } }, (reply) => {
    response.writeHead(reply.statusCode, reply.headers); reply.pipe(response);
  });
  upstream.on('error', () => { if (!response.headersSent) response.writeHead(503, { 'Cache-Control': 'private, no-store' }); response.end(); });
  response.on('close', () => upstream.destroy()); upstream.end(); return true;
}
