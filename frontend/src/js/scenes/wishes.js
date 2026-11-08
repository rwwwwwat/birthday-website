import { navigation } from '../components/navigation.js';
import { heading, heartIcon } from '../components/decor.js';
import { feedbackView } from '../components/wish-feedback.js';
import { saveDraft } from '../components/draft.js';
import { site } from '../../config/site.js';
import { wishSubmission } from '../services/wishSubmission.js';

export function renderWishes(root, { store, scope }) {
  root.innerHTML = '<section class="scene wishes-scene" aria-labelledby="scene-title">' +
    heading('05', 'THE WISHES WE KEEP', '你的每个小心愿，<br><em>我都想认真收藏。</em>', '礼物、惊喜，或是一句想说的话，都可以写在这里。') +
    '<div class="wish-layout"><div class="mailbox-scene" aria-hidden="true"><span class="mailbox-orbit"></span><div class="floating-letter">♡</div><div class="mailbox"><div class="mailbox-roof"></div><div class="mailbox-front"><span class="mail-slot"></span><span class="mailbox-heart">' + heartIcon + '</span><i>LETTERS TO YOU</i><span class="mailbox-keyhole"></span></div><div class="mailbox-flag"></div><div class="mailbox-post"></div><div class="mailbox-base"></div></div><span class="mailbox-caption">every wish matters.</span></div>' +
    '<form class="card wish-card" id="wish-form"><div class="wish-card-top"><span>一封新的心愿</span><i>NO. 05 / WITH LOVE</i></div><label for="wish-content">亲爱的宝宝，你还想要什么？</label><textarea id="wish-content" rows="6" maxlength="2000" placeholder="想要的礼物、想实现的小愿望，或者想对我说的话…… ♡" aria-describedby="wish-count draft-status"></textarea><div class="wish-meta"><span id="draft-status"></span><span id="wish-count"></span></div>' +
    '<button class="button full" type="submit" id="wish-submit">发送给爱你的人 ♡</button><div class="wish-feedback" role="status"><span class="feedback-icon"></span><div><strong></strong><p></p></div></div><div class="wish-receipt" hidden><strong></strong><time></time><span></span></div><button type="button" class="text-button" id="wish-retry" hidden>手动重试 ↻</button><button type="button" class="text-button" id="wish-new" hidden>写下一封心愿 ♡</button><p class="fine-print" id="submission-note"></p></form></div>' +
    '<details class="feedback-preview"><summary>查看信箱反馈样式 · 演示，不会发送</summary><div class="preview-actions"><button type="button" data-preview="pending">整理中</button><button type="button" data-preview="success">送达样式</button><button type="button" data-preview="unavailable">失败与重试</button></div><div class="preview-feedback" aria-live="polite"><strong>仅为样式预览</strong><p>不代表真实提交结果。</p></div></details>' +
    navigation('cake', 'memories', '回看我们的故事 ♡') + '</section>';
  const input = root.querySelector('textarea'), count = root.querySelector('#wish-count');
  const submit = root.querySelector('#wish-submit'), retry = root.querySelector('#wish-retry');
  const feedback = root.querySelector('.wish-feedback');
  let clicked = false, tick;
  input.value = store.get().wishDraft;
  function renderFeedback() {
    if (!scope.alive) return;
    const state = wishSubmission.current();
    const cooldown = Math.max(0, Math.ceil(((state.retryAt || 0) - Date.now()) / 1000));
    const locked = ['submitting', 'unknown', 'success'].includes(state.status) || state.requiresConfirmation;
    const view = feedbackView(state.status, false, { ...state, configured: site.wishesEnabled });
    if (input.value !== store.get().wishDraft) input.value = store.get().wishDraft;
    input.readOnly = !!locked || clicked;
    submit.disabled = !!locked || clicked || cooldown > 0 || !site.wishesEnabled;
    submit.textContent = state.status === 'submitting' ? '正在投递，请稍候…' : '发送给爱你的人 ♡';
    root.querySelector('form').setAttribute('aria-busy', String(state.status === 'submitting'));
    root.querySelector('.wishes-scene').dataset.submission = state.status;
    feedback.dataset.state = state.status;
    feedback.querySelector('.feedback-icon').textContent = view.icon;
    feedback.querySelector('strong').textContent = view.title;
    feedback.querySelector('p').textContent = cooldown ? '请求太频繁，请等待 ' + cooldown + ' 秒后手动重试。' : view.detail;
    count.textContent = input.value.length + ' / 2000';
    root.querySelector('#draft-status').textContent = state.status === 'success'
      ? '已确认保存，草稿已清空'
      : state.requiresConfirmation ? '待核实的内容已保留' : '草稿留在当前浏览器会话中';
    retry.hidden = !(state.status === 'error' && state.canRetry && !state.requiresConfirmation && site.wishesEnabled);
    retry.disabled = clicked || cooldown > 0;
    root.querySelector('#wish-new').hidden = state.status !== 'success';
    const receipt = root.querySelector('.wish-receipt');
    receipt.hidden = state.status !== 'success';
    if (state.status === 'success' && state.receipt) {
      receipt.querySelector('strong').textContent = '已保存 · 心愿编号 ' + state.receipt.wishId;
      receipt.querySelector('time').dateTime = state.receipt.createdAt;
      receipt.querySelector('time').textContent = '服务器保存时间（UTC）：' + state.receipt.createdAt;
      receipt.querySelector('span').textContent = '来源：' + state.receipt.source;
    }
    root.querySelector('#submission-note').textContent = state.requiresConfirmation
      ? '本页已暂停再次投递。请由站点所有者独立核实未保存后，再解除投递锁；刷新不会重发。'
      : !site.wishesEnabled ? '投递地址尚未配置，本页不会发送。' : '只投递一次。超时或断线时请先核实，不要立即重复发送。';
    if (cooldown && !tick) tick = scope.timeout(() => { tick = undefined; renderFeedback(); }, 1000);
  }
  function remember() {
    store.patch({ wishDraft: input.value });
    root.querySelector('#draft-status').textContent = saveDraft(input.value) ? '草稿留在当前浏览器会话中' : '草稿仅保留在本次页面中';
  }
  async function attempt() {
    if (clicked || submit.disabled) return;
    clicked = true; submit.disabled = true; input.readOnly = true;
    try { await wishSubmission.submit(); }
    finally { clicked = false; if (scope.alive) renderFeedback(); }
  }
  scope.on(input, 'input', remember);
  scope.on(root.querySelector('form'), 'submit', (event) => { event.preventDefault(); void attempt(); });
  scope.on(retry, 'click', () => void attempt());
  scope.on(root.querySelector('#wish-new'), 'click', () => {
    if (wishSubmission.startNew()) { renderFeedback(); input.focus(); }
  });
  root.querySelectorAll('[data-preview]').forEach((button) => scope.on(button, 'click', () => {
    const view = feedbackView(button.dataset.preview, true);
    const panel = root.querySelector('.preview-feedback');
    panel.dataset.state = button.dataset.preview;
    panel.querySelector('strong').textContent = view.title;
    panel.querySelector('p').textContent = view.detail + '（仅样式演示）';
  }));
  scope.addCleanup(store.subscribe(renderFeedback));
  renderFeedback();
}
