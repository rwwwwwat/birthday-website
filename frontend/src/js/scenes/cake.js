import { birthdayCopy } from '../../config/copy.js';
import { navigation } from '../components/navigation.js';
import { heading } from '../components/decor.js';
import { cakeArt } from '../components/cake-art.js';
import { createBlowDetector } from '../components/blow-detector.js';
import { celebrate } from '../components/fireworks.js';
import { reducedMotion } from '../components/lifecycle.js';
import { site } from '../../config/site.js';

export function renderCake(root, { store, scope }) {
  root.innerHTML = '<section class="scene cake-scene" aria-labelledby="scene-title">' +
    heading('04', 'HAPPY 20TH BIRTHDAY', '二十岁的心愿，<br><em>都值得被珍藏。</em>', 'Happy Birthday, My Princess!') +
    '<p class="birthday-date">' + site.birthday.replaceAll('-', '.') + ' · 农历' + site.lunarBirthday + '</p>' +
    '<div class="cake-stage"><div class="cake-halo"></div>' + cakeArt() + '<span class="cake-spark spark-a">✧</span><span class="cake-spark spark-b">✦</span><span class="cake-spark spark-c">✧</span><canvas class="fireworks" aria-hidden="true"></canvas></div>' +
    '<div class="cake-message"><p id="cake-message" role="status"></p><div class="birthday-blessing" hidden><span>愿望成真 ♡</span><p></p></div></div>' +
    '<div class="cake-actions"><button type="button" class="button" id="make-wish">我许好愿啦 ♡</button><div class="blow-controls"><button type="button" class="button" id="blow-candle">轻轻吹灭蜡烛 ♡</button><button type="button" class="button secondary" id="start-mic">使用麦克风吹气</button></div><div class="mic-status"><div class="sound-meter" aria-hidden="true"><i></i></div><p id="mic-status" role="status">麦克风只在你点击并授权后开启。</p><button type="button" class="text-button" id="stop-mic" hidden>停止麦克风</button></div><button type="button" class="text-button" id="reset-cake">重新点亮蜡烛 ↻</button></div>' +
    navigation('letter', 'wishes', '大王还有什么心愿？ ♡') + '</section>';
  const stage = root.querySelector('.cake-stage'), message = root.querySelector('#cake-message');
  const make = root.querySelector('#make-wish'), blowButton = root.querySelector('#blow-candle');
  const mic = root.querySelector('#start-mic'), stop = root.querySelector('#stop-mic');
  const micStatus = root.querySelector('#mic-status'), next = root.querySelector('[data-scene=wishes]');
  const blessing = root.querySelector('.birthday-blessing');
  blessing.querySelector('span').textContent = birthdayCopy.title;
  blessing.querySelector('p').textContent = birthdayCopy.blessing;
  let stopFireworks = () => {}, sequence = 0, celebrationDone = store.get().candleOut;
  const detector = createBlowDetector({
    onLevel: (level) => { if (scope.alive) root.querySelector('.sound-meter i').style.transform = 'scaleX(' + level + ')'; },
    onBlow: () => void extinguish(),
    onStatus: (text) => { if (scope.alive) { micStatus.textContent = text; if (!text.includes('正在') && !text.includes('持续吹气') && !text.includes('等待')) { stop.hidden = true; mic.disabled = store.get().candleOut; } } },
  });
  function update() {
    const { candleOut, wishMade } = store.get();
    stage.classList.toggle('is-extinguished', candleOut);
    make.hidden = wishMade || candleOut;
    blowButton.disabled = !wishMade || candleOut;
    mic.disabled = !wishMade || candleOut;
    next.disabled = !candleOut;
    message.textContent = candleOut ? '王若溪大王，20岁生日快乐！' : wishMade ? '愿望许好了，就让烛光替你悄悄收藏。' : '先闭上眼睛，许一个最最美好的愿望吧。';
    blessing.hidden = !candleOut || !celebrationDone;
  }
  async function extinguish() {
    if (store.get().candleOut || !store.get().wishMade) return;
    const token = ++sequence;
    celebrationDone = false;
    detector.stop(); stop.hidden = true;
    store.patch({ candleOut: true }); update();
    next.disabled = true;
    stage.classList.add('is-celebrating'); micStatus.textContent = '麦克风已关闭。';
    if (!await scope.wait(reducedMotion() ? 0 : 650) || token !== sequence) return;
    stopFireworks = celebrate(root.querySelector('canvas'), reducedMotion());
    if (!await scope.wait(reducedMotion() ? 0 : 3200) || token !== sequence) return;
    celebrationDone = true; stage.classList.remove('is-celebrating'); update();
  }
  scope.on(make, 'click', () => { store.patch({ wishMade: true }); update(); });
  scope.on(blowButton, 'click', () => void extinguish());
  scope.on(mic, 'click', async () => {
    if (!store.get().wishMade || store.get().candleOut) return;
    mic.disabled = true; stop.hidden = false;
    const started = await detector.start();
    if (scope.alive && !started) { stop.hidden = true; mic.disabled = store.get().candleOut; }
  });
  scope.on(stop, 'click', () => { detector.stop(); stop.hidden = true; mic.disabled = false; micStatus.textContent = '麦克风已关闭，可以使用点击方式。'; });
  scope.on(root.querySelector('#reset-cake'), 'click', () => {
    sequence++; detector.stop(); stopFireworks(); stop.hidden = true;
    celebrationDone = false;
    stage.classList.remove('is-celebrating');
    store.patch({ wishMade: false, candleOut: false }); update();
    micStatus.textContent = '麦克风只在你点击并授权后开启。';
  });
  scope.on(document, 'visibilitychange', () => { if (document.hidden) { detector.stop(); stop.hidden = true; mic.disabled = !store.get().wishMade || store.get().candleOut; micStatus.textContent = '麦克风已关闭。'; } });
  scope.addCleanup(() => { sequence++; detector.stop(); stopFireworks(); });
  update();
}
