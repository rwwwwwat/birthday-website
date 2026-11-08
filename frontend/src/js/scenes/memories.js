import { photos, photoCategories } from '../../config/photos.js';
import { site } from '../../config/site.js';
import { navigation } from '../components/navigation.js';
import { heading } from '../components/decor.js';
import { reducedMotion } from '../components/lifecycle.js';
import { relationshipLabel } from '../components/relationship.js';
import { createPhotoViewer } from '../components/photo-viewer.js';

export function renderMemories(root, { store, scope, music }) {
  root.innerHTML = '<section class="scene memories-scene" aria-labelledby="scene-title">' +
    heading('02', 'OUR BEAUTIFUL MEMORIES', '把我们的瞬间，<br><em>连成一颗心。</em>', '属于我们的每一个瞬间，都是我最珍贵的宝藏。') +
    '<p class="day-counter" id="day-counter"></p><div class="photo-categories" aria-label="照片分类"><button type="button" data-category="all" aria-pressed="true">全部珍藏 · 10</button>' +
    photoCategories.map((category) => '<button type="button" data-category="' + category.id + '" aria-pressed="false">' + category.title + ' · ' + photos.filter((photo) => photo.category === category.id).length + '</button>').join('') + '</div><div class="heart-stage" id="photo-stage" data-phase="initial">' +
    '<svg class="heart-rail" viewBox="0 0 500 440" fill="none" aria-hidden="true"><path id="heart-path" d="M250 110 C140 -10 8 80 45 185 C78 275 180 340 250 395 C320 340 422 275 455 185 C492 80 360 -10 250 110Z"/></svg>' +
    '<div class="heart-center" aria-hidden="true"><span>♡</span><p>every little moment</p><strong>都是心动</strong></div>' +
    photos.map((photo, i) => '<button type="button" class="train-photo ' + (i === 0 ? 'is-featured' : '') + '" data-photo="' + photo.id + '" ' + (i > 0 ? 'hidden' : '') + ' aria-label="放大：' + photo.title + '"><img src="' + photo.src + '" alt="' + photo.title + '" ' + (i > 0 ? 'loading="lazy"' : 'fetchpriority="high"') + '/><span>' + String(photo.id).padStart(2, '0') + ' · ' + photo.title + '</span></button>').join('') +
    '</div><div class="memory-controls"><p class="memory-status" id="memory-status" role="status">从这一张合照开始，收藏每一份心动。</p><button type="button" class="button" id="show-memories">Continue ♡</button></div>' +
    navigation('login', 'letter', '把下一份心意拆开') +
    '<dialog class="photo-dialog" aria-labelledby="photo-dialog-title"><button type="button" class="dialog-close" aria-label="关闭照片">×</button><span class="photo-number"></span><img alt=""/><h2 id="photo-dialog-title"></h2><p></p><small>轻触关闭，回到心动的位置</small></dialog></section>';
  const updateDay = () => { root.querySelector('#day-counter').textContent = relationshipLabel(site.relationshipStartDate); };
  function watchDay() { updateDay(); scope.timeout(watchDay, 60000); }
  watchDay(); scope.on(document, 'visibilitychange', () => { if (!document.hidden) updateDay(); });
  const stage = root.querySelector('.heart-stage'), path = root.querySelector('#heart-path');
  const buttons = [...root.querySelectorAll('[data-photo]')];
  const playButton = root.querySelector('#show-memories'), next = root.querySelector('[data-scene=letter]');
  const status = root.querySelector('#memory-status'), viewer = createPhotoViewer(root, scope, {
    onOpen: (photo) => { if (photo.musicEgg) music.special(); },
  });
  const length = path.getTotalLength();
  let playing = false;
  function pose(fraction, index, scale = 1) {
    const point = path.getPointAtLength(length * fraction);
    return 'translate(' + ((point.x - 250) / 500 * stage.clientWidth) + 'px,' + (point.y / 440 * stage.clientHeight) + 'px) translate(-50%,-50%) rotate(' + ((index % 2 ? 1 : -1) * 5) + 'deg) scale(' + scale + ')';
  }
  const target = (i) => 1 - i * 0.1;
  function settle() {
    buttons.forEach((button, i) => {
      button.hidden = false; button.disabled = false; button.classList.remove('is-featured');
      button.style.transform = pose(target(i), i); button.style.opacity = '1';
    });
    stage.dataset.phase = 'complete'; next.disabled = false; playButton.disabled = false;
    playButton.textContent = '再看一次心动轨迹 ↻';
    status.textContent = '十个瞬间，一颗完整的心。轻触照片，放大看看。';
    playing = false;
  }
  async function play() {
    if (playing) return;
    playing = true; playButton.disabled = true; next.disabled = true;
    store.patch({ memoriesStarted: false });
    stage.dataset.phase = 'traveling'; status.textContent = '让回忆一张一张，向你靠近……';
    const firstRect = buttons[0].getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    const tasks = buttons.map((button, i) => {
      button.hidden = false; button.disabled = true; button.classList.remove('is-featured'); button.style.opacity = '0';
      const destination = pose(target(i), i);
      if (reducedMotion()) { button.style.transform = destination; return Promise.resolve(); }
      const duration = 400 + target(i) * 3000;
      const frames = [];
      if (i === 0) {
        frames.push({ transform: 'translate(' + (firstRect.left + firstRect.width / 2 - stageRect.left - stage.clientWidth / 2) + 'px,' + (firstRect.top + firstRect.height / 2 - stageRect.top) + 'px) translate(-50%,-50%) scale(' + firstRect.width / button.offsetWidth + ')', opacity: 1, offset: 0 });
      } else frames.push({ transform: pose(0, i, 0.6), opacity: 0, offset: 0 });
      frames.push({ transform: pose(0, i), opacity: 1, offset: 400 / duration });
      for (let n = 1; n <= 40; n++) frames.push({ transform: pose(target(i) * n / 40, i), opacity: 1, offset: (400 + target(i) * 3000 * n / 40) / duration });
      const animation = scope.animate(button, frames, { duration, delay: i * 300, fill: 'both', easing: 'linear' });
      return animation.finished.catch(() => {}).then(() => {
        if (!scope.alive) return; button.style.transform = destination; button.style.opacity = '1'; animation.cancel();
      });
    });
    await Promise.all(tasks);
    if (!scope.alive) return;
    store.patch({ memoriesStarted: true }); settle();
  }
  buttons.forEach((button, i) => scope.on(button, 'click', () => { if (!playing) void viewer.open(button, photos[i]); }));
  scope.on(playButton, 'click', () => void play());
  root.querySelectorAll('[data-category]').forEach((chip) => scope.on(chip, 'click', () => {
    const category = chip.dataset.category;
    root.querySelectorAll('[data-category]').forEach((item) => item.setAttribute('aria-pressed', String(item === chip)));
    buttons.forEach((button, i) => button.classList.toggle('is-category-muted', category !== 'all' && photos[i].category !== category));
    if (!store.get().memoriesStarted && !playing) void play();
  }));
  const observer = new ResizeObserver(() => { if (!playing && store.get().memoriesStarted) settle(); });
  observer.observe(stage); scope.addCleanup(() => observer.disconnect());
  next.disabled = !store.get().memoriesStarted;
  if (store.get().memoriesStarted) settle();
}
