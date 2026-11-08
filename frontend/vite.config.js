import { defineConfig, loadEnv } from 'vite';
import { privateMediaPlugin } from './scripts/private-media.js';

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const mediaTarget = new URL(process.env.MEDIA_PROXY_TARGET || 'http://localhost:5270');
  if (!['localhost', '127.0.0.1', '[::1]'].includes(mediaTarget.hostname) || mediaTarget.protocol !== 'http:'
      || mediaTarget.username || mediaTarget.password || mediaTarget.pathname !== '/' || mediaTarget.search || mediaTarget.hash)
    throw new Error('Local media proxy must target a loopback HTTP origin.');
  const proxy = { '/media': { target: mediaTarget.origin, changeOrigin: true, xfwd: false } };
  let address = env.VITE_API_BASE_URL?.trim() || '';
  // A local .env.local must never silently become the public production API.
  if (command === 'build') {
    try {
      const url = new URL(address);
      if (url.protocol !== 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) address = '';
    } catch { address = ''; }
  }
  return {
    base: './',
    publicDir: false,
    plugins: [privateMediaPlugin({ staticMedia: env.VITE_MEDIA_MODE === 'static' })],
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(address) },
    server: { host: 'localhost', port: 5173, strictPort: true, proxy,
      fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/audio/**'] } },
    preview: { host: 'localhost', port: 4173, strictPort: true, proxy },
  };
});
