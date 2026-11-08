export function createMusicEngine(audio, config) {
  const { tracks, specialId } = config;
  let index = Math.max(0, tracks.findIndex((t) => t.id === config.defaultId));
  let mode = 'normal', track = tracks[index], status = 'paused', version = 0;
  let pendingSeek = 0, autoTried = false, gestureTried = false, userPaused = false, eggArmed = true, lastTime = 0;
  const positions = new Map(), listeners = new Set();
  audio.loop = false; audio.preload = 'metadata'; audio.volume = config.volume; audio.src = track.src;
  const current = () => ({ mode, track, normalIndex: index, status, paused: audio.paused,
    currentTime: status === 'error' ? lastTime : Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
    duration: Number.isFinite(audio.duration) ? audio.duration : 0,
    positions: Object.fromEntries(positions), eggArmed, volume: audio.volume });
  const publish = () => listeners.forEach((listener) => listener(current()));
  function saveNormal() { if (mode === 'normal') positions.set(track.id, lastTime); }
  function applySeek() { try { audio.currentTime = pendingSeek; } catch { /* Await metadata. */ } }
  function load(next, nextMode) {
    ++version; audio.pause(); mode = nextMode; track = next;
    pendingSeek = mode === 'special' ? 0 : positions.get(track.id) || 0;
    lastTime = pendingSeek;
    audio.src = track.src; audio.volume = config.volume; audio.load(); applySeek(); status = 'paused'; publish();
  }
  async function play() {
    const attempt = ++version; status = 'loading'; audio.volume = config.volume; publish();
    try { await audio.play(); if (attempt === version) { status = 'playing'; publish(); } }
    catch (error) { if (attempt === version) { status = error?.name === 'NotAllowedError' ? 'blocked' : 'error'; publish(); } }
  }
  function nextIndex(direction = 1, skipSpecial = false) {
    let candidate = (index + direction + tracks.length) % tracks.length;
    if (skipSpecial && tracks[candidate].id === specialId) candidate = (candidate + direction + tracks.length) % tracks.length;
    return candidate;
  }
  function select(id, shouldPlay = true) {
    const selected = tracks.findIndex((item) => item.id === id); if (selected < 0) return false;
    saveNormal(); index = selected; load(tracks[index], 'normal');
    userPaused = !shouldPlay; if (shouldPlay) void play(); return true;
  }
  audio.addEventListener('loadedmetadata', () => { applySeek(); publish(); });
  audio.addEventListener('timeupdate', () => {
    if (!audio.error && status !== 'error' && !(audio.readyState === 0 && pendingSeek > 0)) lastTime = audio.currentTime || 0;
    saveNormal(); publish();
  });
  audio.addEventListener('playing', () => { if (!audio.paused) { status = 'playing'; publish(); } });
  audio.addEventListener('pause', () => { if (audio.paused && status === 'playing') { status = 'paused'; publish(); } });
  audio.addEventListener('error', () => { ++version; status = 'error'; publish(); });
  audio.addEventListener('ended', () => {
    if (mode === 'special') { index = nextIndex(1, true); load(tracks[index], 'normal'); }
    else { positions.set(track.id, 0); eggArmed = true; index = nextIndex(); load(tracks[index], 'normal'); }
    userPaused = false; void play();
  });
  return {
    current, subscribe(listener) { listeners.add(listener); listener(current()); return () => listeners.delete(listener); },
    autoplay() { if (autoTried || userPaused) return; autoTried = true; void play(); },
    start() { if (gestureTried) return; gestureTried = true;
      if (userPaused || status === 'playing' || status === 'loading') return; void play(); },
    resume() {
      userPaused = false;
      if (status === 'error' || audio.error) {
        ++version; audio.pause(); pendingSeek = lastTime; audio.src = track.src; audio.load(); applySeek();
      }
      void play();
    },
    pause() { userPaused = true; ++version; audio.pause(); status = 'paused'; saveNormal(); publish(); },
    select, next() { return select(tracks[nextIndex(1, mode === 'special')].id); },
    previous() { return select(tracks[nextIndex(-1, mode === 'special')].id); },
    seek(seconds) { if (!Number.isFinite(seconds)) return; pendingSeek = Math.max(0, Math.min(seconds, audio.duration || 0)); lastTime = pendingSeek; applySeek(); saveNormal(); publish(); },
    special() {
      if (mode === 'special' || !eggArmed) return false;
      const special = tracks.find((item) => item.id === specialId); if (!special) return false;
      saveNormal(); eggArmed = false; userPaused = false; load(special, 'special'); void play(); return true;
    },
  };
}
