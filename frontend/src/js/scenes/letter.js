import { letterCopy } from '../../config/copy.js';
import { navigation } from '../components/navigation.js';
import { heading, heartIcon } from '../components/decor.js';
import { reducedMotion } from '../components/lifecycle.js';

export function renderLetter(root, { store, scope }) {
  root.innerHTML = '<section class="scene letter-scene" aria-labelledby="scene-title">' +
    heading('03', 'A LETTER TO MY PRINCESS', '有些心意，<br><em>想亲手交给你。</em>', '不必匆忙，慢慢拆开这份温柔。') +
    '<div class="letter-stage"><button type="button" class="envelope" id="open-letter" aria-expanded="false" aria-label="打开写给王若溪大王的信"><span class="envelope-liner"></span><span class="paper-slip"><i></i><i></i><i></i></span><span class="envelope-front"></span><span class="envelope-flap"></span><span class="envelope-address"><i>To My Princess</i><strong>王若溪大王亲启</strong></span><span class="wax-seal">' + heartIcon + '</span></button><p class="envelope-hint">轻触火漆，拆开这封信 ♡</p></div>' +
    '<article class="letter-paper" id="letter-paper" hidden><div class="letter-topline"><span>WITH ALL MY LOVE</span><span>♡</span></div><p class="placeholder-label"></p><div id="letter-content" aria-label="祝福信正文"></div><p class="letter-announcement sr-only" role="status"></p><div class="letter-tools"><button type="button" class="text-button" id="skip-letter">直接读完整封信</button><button type="button" class="text-button" id="replay-letter">重新拆信 ↻</button></div><div class="letter-bottomline">a little letter, a lot of love.</div></article>' +
    navigation('memories', 'cake', '下一站：20岁生日惊喜') + '</section>';
  root.querySelector('.placeholder-label').textContent = letterCopy.label;
  const envelope = root.querySelector('.envelope'), paper = root.querySelector('#letter-paper');
  const content = root.querySelector('#letter-content'), skip = root.querySelector('#skip-letter');
  const next = root.querySelector('[data-scene=cake]');
  const characters = [...new Intl.Segmenter('zh-CN', { granularity: 'grapheme' }).segment(letterCopy.text)].map((part) => part.segment);
  let sequence = 0, writing = false;
  function finish() {
    writing = false; sequence++;
    content.textContent = letterCopy.text; content.classList.remove('is-typing');
    store.patch({ letterOpened: true, letterComplete: true, letterProgress: characters.length });
    skip.hidden = true; next.disabled = false;
    root.querySelector('.letter-announcement').textContent = '整封祝福信已展开。';
  }
  function type(token) {
    if (!scope.alive || token !== sequence || !writing) return;
    const progress = Math.min(characters.length, store.get().letterProgress + 2);
    store.patch({ letterProgress: progress });
    content.textContent = characters.slice(0, progress).join('');
    if (progress === characters.length) finish();
    else scope.timeout(() => type(token), 45);
  }
  async function open() {
    if (store.get().letterOpened || writing) return;
    const token = ++sequence; writing = true;
    store.patch({ letterOpened: true, letterComplete: false, letterProgress: 0 });
    envelope.classList.add('is-opening'); envelope.setAttribute('aria-expanded', 'true');
    if (!await scope.wait(reducedMotion() ? 0 : 850) || token !== sequence) return;
    paper.hidden = false; paper.classList.add('is-revealed');
    if (!await scope.wait(reducedMotion() ? 0 : 450) || token !== sequence) return;
    if (reducedMotion()) finish();
    else { content.classList.add('is-typing'); type(token); }
  }
  scope.on(envelope, 'click', () => void open());
  scope.on(skip, 'click', finish);
  scope.on(root.querySelector('#replay-letter'), 'click', () => {
    sequence++; writing = false;
    store.patch({ letterOpened: false, letterComplete: false, letterProgress: 0 });
    envelope.classList.remove('is-opening'); envelope.setAttribute('aria-expanded', 'false');
    paper.hidden = true; content.textContent = ''; skip.hidden = false; next.disabled = true;
    envelope.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'center' });
    envelope.focus({ preventScroll: true });
  });
  next.disabled = !store.get().letterComplete;
  if (store.get().letterOpened) { envelope.classList.add('is-opening'); envelope.setAttribute('aria-expanded', 'true'); paper.hidden = false; finish(); }
}
