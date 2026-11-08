import '../css/style.css';
import { site } from '../config/site.js';
import { store, sceneIds } from './state.js';
import { createMusicPlayer } from './components/music.js';
import { bindNavigation } from './components/navigation.js';
import { createScope, reducedMotion } from './components/lifecycle.js';
import { renderLogin } from './scenes/login.js';
import { renderMemories } from './scenes/memories.js';
import { renderLetter } from './scenes/letter.js';
import { renderCake } from './scenes/cake.js';
import { renderWishes } from './scenes/wishes.js';

const root = document.querySelector('#app');
const music = createMusicPlayer(document.querySelector('#music-control'), site.music, store);
const renderers = { login: renderLogin, memories: renderMemories, letter: renderLetter, cake: renderCake, wishes: renderWishes };
const names = ['公主身份验证', '我们的回忆', '写给你的信', '20岁生日惊喜', '愿望信箱'];
let current, scope, transitioning = false;
async function navigate(scene) {
  if (transitioning || current === scene || !sceneIds.includes(scene)) return;
  if (scene !== 'login' && !store.get().unlocked) return;
  transitioning = true;
  const overlay = document.querySelector('#scene-transition');
  try {
    if (!reducedMotion()) {
      overlay.classList.add('is-active');
      await new Promise((resolve) => setTimeout(resolve, 260));
    }
    store.patch({ scene });
    if (!reducedMotion()) await new Promise((resolve) => setTimeout(resolve, 350));
  } finally { overlay.classList.remove('is-active'); transitioning = false; }
}
function render(state) {
  if (current === state.scene) return;
  scope?.dispose();
  current = state.scene;
  scope = createScope();
  document.body.dataset.scene = current;
  renderers[current](root, { store, music, scope, navigate });
  bindNavigation(root, navigate, scope);
  const index = sceneIds.indexOf(current);
  document.querySelector('#chapter-label').textContent = 'CHAPTER ' + String(index + 1).padStart(2, '0') + ' / 05';
  document.querySelectorAll('.chapter-dot').forEach((dot, i) => {
    dot.classList.toggle('is-current', i === index);
    dot.classList.toggle('is-complete', i < index);
    dot.setAttribute('aria-current', i === index ? 'step' : 'false');
    dot.disabled = !state.unlocked && i > 0;
  });
  document.title = names[index] + ' · 王若溪大王的生日奇幻之旅';
  root.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'instant' });
}
const dots = document.querySelector('#chapter-progress');
dots.innerHTML = sceneIds.map((id, i) => '<button type="button" class="chapter-dot" data-chapter="' + id + '" aria-label="' + names[i] + '"><span>' + String(i + 1).padStart(2, '0') + '</span></button>').join('');
dots.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => void navigate(button.dataset.chapter)));
document.querySelector('#home-link').addEventListener('click', (event) => { event.preventDefault(); void navigate('login'); });
window.addEventListener('pagehide', () => scope?.dispose());
window.addEventListener('pageshow', (event) => { if (event.persisted) { current = undefined; render(store.get()); } });
store.subscribe(render);
render(store.get());
