import { createMusicEngine } from './music-engine.js';
const clock = (seconds) => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
export function createMusicPlayer(container, config, store) {
  const audio = document.createElement('audio'); audio.id = 'site-audio'; audio.hidden = true; audio.setAttribute('playsinline', '');
  container.innerHTML = '<button type="button" class="music-toggle" aria-expanded="false" aria-controls="music-panel" aria-label="打开音乐收藏"><img alt=""/><span>音乐收藏</span><i aria-hidden="true">♫</i></button>' +
    '<section id="music-panel" class="music-panel" aria-label="音乐收藏" hidden><div class="music-panel-heading"><span>OUR LITTLE SOUNDTRACK</span><button type="button" class="music-close" aria-label="收起播放器">×</button></div>' +
    '<div class="now-playing"><img class="current-cover" alt=""/><div><small id="music-mode"></small><h2 id="music-title"></h2><p id="music-artist"></p></div></div>' +
    '<p id="music-status" role="status"></p><input id="music-progress" type="range" min="0" max="0" value="0" step="0.1" aria-label="播放进度"/><div class="music-timing"><span id="music-time">0:00 / 0:00</span><span>音量 15% · 歌单循环</span></div>' +
    '<div class="music-buttons"><button type="button" id="music-prev" aria-label="上一首">‹</button><button type="button" id="music-play">播放</button><button type="button" id="music-next" aria-label="下一首">›</button></div>' +
    '<div class="music-collection" aria-label="四首音乐收藏"></div><p class="music-footnote">一首歌，也是一份小小的心意。</p></section>';
  container.append(audio);
  const engine = createMusicEngine(audio, config), toggle = container.querySelector('.music-toggle');
  const panel = container.querySelector('#music-panel'), progress = container.querySelector('#music-progress');
  const covers = config.tracks.map((track) => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.track = track.id;
    button.setAttribute('aria-label', '选择 ' + track.title + ' · ' + track.artist);
    const img = document.createElement('img'); img.src = track.cover; img.alt = track.title + '封面'; img.loading = 'lazy';
    const label = document.createElement('span'); label.textContent = track.title; button.append(img, label);
    button.addEventListener('click', () => engine.select(track.id)); container.querySelector('.music-collection').append(button); return button;
  });
  function close(focus = false) { panel.hidden = true; toggle.setAttribute('aria-expanded', 'false'); if (focus) toggle.focus(); }
  toggle.addEventListener('click', () => { panel.hidden = !panel.hidden; toggle.setAttribute('aria-expanded', String(!panel.hidden)); });
  container.querySelector('.music-close').addEventListener('click', () => close(true));
  document.addEventListener('click', (event) => { if (!container.contains(event.target)) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !panel.hidden) { close(true); event.preventDefault(); } });
  container.querySelector('#music-play').addEventListener('click', () => {
    const state = engine.current(); if (state.status === 'playing' || state.status === 'loading') engine.pause();
    else {
      if (state.status === 'error') container.querySelectorAll('img').forEach((img) => { const src = img.getAttribute('src'); if (src) img.src = src; });
      engine.resume();
    }
  });
  container.querySelector('#music-prev').addEventListener('click', engine.previous);
  container.querySelector('#music-next').addEventListener('click', engine.next);
  progress.addEventListener('input', () => engine.seek(Number(progress.value)));
  let lastTrack, lastEnabled;
  engine.subscribe((state) => {
    panel.dataset.mode = state.mode; panel.dataset.track = state.track.id; panel.dataset.status = state.status;
    if (lastTrack !== state.track.id) {
      container.querySelector('.current-cover').src = state.track.cover;
      container.querySelector('.current-cover').alt = state.track.title + '封面'; toggle.querySelector('img').src = state.track.cover;
      container.querySelector('#music-title').textContent = state.track.title;
      container.querySelector('#music-artist').textContent = state.track.artist; lastTrack = state.track.id;
    }
    toggle.querySelector('span').textContent = state.track.title;
    toggle.setAttribute('aria-label', '音乐收藏：' + state.track.title + '，' + (state.status === 'playing' ? '播放中' : '已暂停'));
    toggle.classList.toggle('is-playing', state.status === 'playing');
    container.querySelector('#music-mode').textContent = state.mode === 'special' ? '第一次合照 · 专属彩蛋' : '你的音乐收藏';
    const statuses = { paused: '轻触播放，让旋律陪着你。', loading: '正在准备这段旋律…', playing: state.mode === 'special' ? '合照的专属旋律 · 结束后继续下一首' : '正在播放 · 让心意慢慢流动', blocked: '浏览器暂停了自动播放，轻触播放即可。', error: '暂时无法播放，进度已保留。请检查网络或重新验证身份后，手动播放。' };
    container.querySelector('#music-status').textContent = statuses[state.status];
    container.querySelector('#music-play').textContent = ['playing', 'loading'].includes(state.status) ? '暂停' : '播放';
    progress.max = state.duration; progress.value = state.currentTime; progress.disabled = !state.duration;
    progress.setAttribute('aria-valuetext', clock(state.currentTime) + '，共' + clock(state.duration));
    container.querySelector('#music-time').textContent = clock(state.currentTime) + ' / ' + clock(state.duration);
    covers.forEach((button) => { const selected = button.dataset.track === state.track.id; button.classList.toggle('is-current', selected); button.setAttribute('aria-pressed', String(selected)); });
    const enabled = state.status === 'playing'; if (enabled !== lastEnabled) { lastEnabled = enabled; store.patch({ musicEnabled: enabled }); }
  });
  let gestureHandled = false;
  const firstGesture = (event) => {
    if (!event.isTrusted || (event.type === 'keydown' && !['Enter', ' '].includes(event.key))) return;
    if (gestureHandled) return; gestureHandled = true;
    document.removeEventListener('click', firstGesture); document.removeEventListener('keydown', firstGesture);
    if (!event.target.closest('#music-play, [data-track], #music-next, #music-prev')) engine.start();
  };
  document.addEventListener('click', firstGesture); document.addEventListener('keydown', firstGesture);
  engine.autoplay(); return engine;
}
