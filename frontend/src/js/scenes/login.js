import { site } from '../../config/site.js';
import { avatar } from '../../config/photos.js';
import { ornaments, crownIcon, heartIcon } from '../components/decor.js';
import { reducedMotion } from '../components/lifecycle.js';

export function renderLogin(root, { store, music, scope, navigate }) {
  root.innerHTML = '<section class="scene login-scene" aria-labelledby="scene-title">' + ornaments() +
    '<div class="invitation-copy"><p class="eyebrow">A BIRTHDAY INVITATION · JUST FOR YOU</p><div class="edition-mark"><span>20</span><i>th</i><small>THE MOST BEAUTIFUL CHAPTER</small></div>' +
    '<h1 id="scene-title">今天的世界，<br>只为<span class="title-rose">你</span>闪耀。</h1><p class="intro">亲爱的宝宝，<br>有一份只属于你的惊喜，等你亲手打开。</p>' +
    '<div class="handwritten">a little magic, a lot of love.</div><div class="invitation-rule"><span>♡</span><p>王若溪大王的生日奇幻之旅</p></div></div>' +
    '<div class="invitation-panel"><form class="card login-card" id="login-form"><div class="card-corner corner-tl"></div><div class="card-corner corner-br"></div>' +
    '<div class="crown">' + crownIcon + '</div><div class="avatar-frame"><img class="avatar" src="' + avatar + '" width="96" height="96" alt="宝宝的专属头像" fetchpriority="high"/><span class="avatar-spark">✧</span></div>' +
    '<p class="small-caps">YOUR ROYAL HIGHNESS</p><h2>公主身份验证</h2><p class="card-subtitle">凭专属口令，开启这段心动旅程。</p>' +
    '<label for="account">专属账号 <span>PRINCESS</span></label><input id="account" value="' + site.account + '" readonly autocomplete="username"/>' +
    '<label for="code">神秘口令 <span>SECRET CODE</span></label><div class="password-row"><input id="code" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" required maxlength="16" placeholder="请输入你的专属口令" aria-describedby="login-error"/><button type="button" class="text-button" id="show-code" aria-pressed="false">显示</button></div>' +
    '<p id="login-error" class="form-message" role="status"></p><button class="button full" id="unlock-button" type="submit">开启我的生日之旅 <span aria-hidden="true">♡</span></button>' +
    '<div class="card-signature"><span></span> WITH LOVE, ALWAYS <span></span></div><div class="unlock-bloom" aria-hidden="true">' + heartIcon + '</div></form><p class="below-card">专属于宝宝的一场浪漫奇遇</p></div></section>';
  const code = root.querySelector('#code');
  scope.on(root.querySelector('#show-code'), 'click', (event) => {
    const show = code.type === 'password'; code.type = show ? 'text' : 'password';
    event.currentTarget.textContent = show ? '隐藏' : '显示';
    event.currentTarget.setAttribute('aria-pressed', String(show));
  });
  let unlocking = false;
  scope.on(root.querySelector('#login-form'), 'submit', async (event) => {
    event.preventDefault();
    if (unlocking) return;
    if (code.value !== site.ceremonyCode) {
      root.querySelector('#login-error').textContent = '公主殿下，神秘口令好像不对哦 ♡';
      code.setAttribute('aria-invalid', 'true');
      if (!reducedMotion()) scope.animate(root.querySelector('.login-card'), [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 240 });
      return;
    }
    unlocking = true; code.removeAttribute('aria-invalid');
    root.querySelector('#login-error').textContent = '身份确认，是最可爱的宝宝 ♡';
    root.querySelector('#unlock-button').disabled = true;
    root.querySelector('.login-scene').classList.add('is-unlocking');
    void music.start(); store.patch({ unlocked: true });
    if (await scope.wait(reducedMotion() ? 0 : 950)) void navigate('memories');
  });
}
