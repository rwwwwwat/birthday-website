import { createHash } from 'node:crypto';
import { copyFile, cp, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, dirname, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const publicRoot = resolve(root, 'public');
export const publicAssets = ['favicon.svg', ...['firstphoto','other1','other2','other3','other4','pther5','other6','other7','other8','other9','userphoto'].map((name) => 'images/' + name + '.jpg')];
const coverNames = new Set([
  'Michita feat. AMIのPurenessからの楽曲Cry For Me (feat. 愛海)をAmazon Musicで.jpg',
  '＜コラム＞iriが『Mステ』初出演、バイラルヒット「会いたいわ」がもたらした“揺るぎない自信” _ Special _ Billboard JAPAN.jpg',
  '迷人的危險 - dance flow_ Song Lyrics, Music Videos & Concerts.jpg',
  '”カタオモイ” by Aimer - トラック・歌詞情報 _ AWA.jpg',
]);
export function privateArtifactReason(path, hash = '', protectedHashes = new Set()) {
  const normalized = path.replaceAll('\\', '/');
  if (normalized.split('/').some((part) => part.toLowerCase() === 'audio')) return 'private audio directory';
  if (/\.(mp3|m4a|aac|flac|wav|ogg|opus|mp4|webm)$/i.test(path)) return 'audio/video file';
  if (coverNames.has(normalized.split('/').at(-1))) return 'private cover';
  if (hash && protectedHashes.has(hash)) return 'private file hash';
  return null;
}
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Build artifacts must not contain symbolic links');
    if (entry.isDirectory()) result.push(...await files(path)); else result.push(path);
  }
  return result;
}
const hash = async (path) => createHash('sha256').update(await readFile(path)).digest('hex');
export async function assertPrivateMediaAbsent(outputDirectory) {
  const protectedHashes = new Set();
  try { for (const path of await files(resolve(root, '../audio'))) protectedHashes.add(await hash(path)); }
  catch (error) { if (error.code !== 'ENOENT') throw error; } // Clean source checkout has no private media.
  for (const path of await files(outputDirectory)) {
    const reason = privateArtifactReason(relative(outputDirectory, path), await hash(path), protectedHashes);
    if (reason) throw new Error('Private media in build artifact: ' + relative(outputDirectory, path) + ' (' + reason + ')');
  }
}
function staticGuard(request, response, next) {
  let path;
  try { path = new URL(request.url, 'http://localhost').pathname; for (let i = 0; i < 3; i++) { const decoded = decodeURIComponent(path); if (decoded === path) break; path = decoded; } }
  catch { response.writeHead(400).end(); return; }
  // /media routes go to the backend. All old raw/audio/@fs paths stay inaccessible.
  if (!path.startsWith('/media/') && (/(^|\/)audio(\/|$)/i.test(path) || path.startsWith('/@fs/'))) {
    response.writeHead(404, { 'Cache-Control': 'private, no-store' }).end(); return;
  }
  next();
}
export function privateMediaPlugin(options = {}) {
  const staticMedia = options.staticMedia ?? process.env.VITE_MEDIA_MODE === 'static';
  let output, isBuild;
  return {
    name: 'private-media-boundary',
    configResolved(config) { output = resolve(config.root, config.build.outDir); isBuild = config.command === 'build'; },
    configureServer(server) {
      server.middlewares.use(staticGuard);
      server.middlewares.use(async (request, response, next) => {
        const path = new URL(request.url, 'http://localhost').pathname.slice(1);
        if (!publicAssets.includes(path) || !['GET', 'HEAD'].includes(request.method)) { next(); return; }
        try {
          const file = resolve(publicRoot, path), info = await stat(file);
          response.writeHead(200, { 'Content-Type': extname(file) === '.svg' ? 'image/svg+xml' : 'image/jpeg', 'Content-Length': info.size });
          if (request.method === 'HEAD') response.end(); else createReadStream(file).on('error', () => response.destroy()).pipe(response);
        } catch { response.writeHead(404).end(); }
      });
    },
    configurePreviewServer(server) { server.middlewares.use(staticGuard); },
    async closeBundle() {
      if (!isBuild) return;
      for (const name of publicAssets) { const target = resolve(output, name); await mkdir(dirname(target), { recursive: true }); await copyFile(resolve(publicRoot, name), target); }
      if (staticMedia) {
        await cp(resolve(root, '..', 'media'), resolve(output, 'media'), { recursive: true });
        return;
      }
      await assertPrivateMediaAbsent(output);
    },
  };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.VITE_MEDIA_MODE === 'static') {
    console.log('Static media mode: songs and covers are published from ./media.');
    process.exit(0);
  }
  await assertPrivateMediaAbsent(resolve(process.argv[2] || resolve(root, 'dist')));
  console.log('Private media check passed: no songs or private covers in build output.');
}
