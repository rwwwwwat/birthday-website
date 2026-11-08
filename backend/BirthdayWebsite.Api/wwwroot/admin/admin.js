import { createWishPoller } from './polling.js';
const $ = (selector) => document.querySelector(selector);
let csrf, epoch = 0, page = 1, pageSize = 20, filter = 'all', pageRequest = 0, detailRequest = 0;
let user, currentDetail, loginBusy = false, markBusy = false, poller;
const text = (selector, value) => { $(selector).textContent = String(value); };
function formatTime(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '还没有来信'; }
function clearProtected(message = '') {
  ++epoch; ++pageRequest; ++detailRequest; user = null; currentDetail = null; csrf = undefined; poller?.stop();
  $('#dashboard').hidden = true; $('#login-view').hidden = false; $('#wish-list').replaceChildren();
  text('#detail-content', ''); text('#detail-meta', ''); text('#detail-source', ''); text('#admin-name', '');
  ['#total-count','#unread-count','#read-count','#latest-time','#nav-count','#list-total'].forEach((s) => text(s, '—'));
  $('#notice').hidden = true; text('#login-message', message); $('#password').value = '';
}
async function api(path, options = {}) {
  const version = epoch, controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
  const response = await fetch('/api/admin/' + path, { ...options, signal: controller.signal, credentials: 'same-origin', cache: 'no-store',
    headers: { Accept: 'application/json', ...options.headers } });
  if (response.status === 401 && path !== 'login') { if (version === epoch) clearProtected('登录已过期，请重新登录。'); throw new Error('请重新登录'); }
  if (!response.ok) {
    const message = response.status === 429 ? '操作太频繁，请稍后再试。' : response.status === 401 ? '登录失败，请检查管理员凭据。'
      : response.status === 404 ? '这封心愿不存在。' : response.status === 400 ? '请求或安全令牌无效，请刷新后再试。' : '暂时无法完成操作，请稍后手动重试。';
    throw new Error(message);
  }
  return response.status === 204 ? null : await response.json();
  } catch (error) {
    if (error.name === 'AbortError' || error instanceof TypeError || error instanceof SyntaxError)
      throw new Error('连接或响应暂时无法确认，请稍后手动核实。');
    throw error;
  } finally { clearTimeout(timer); }
}
async function token() { if (!csrf) csrf = (await api('csrf')).token; return csrf; }
async function mutate(path, method, body) {
  return api(path, { method, headers: { 'X-CSRF-TOKEN': await token(), 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
}
function stats(value) {
  text('#total-count', value.totalCount); text('#unread-count', value.unreadCount); text('#read-count', value.readCount);
  text('#nav-count', value.unreadCount); text('#latest-time', formatTime(value.latestCreatedAt));
  $('#latest-time').title = value.latestCreatedAt || ''; text('#poll-status', '在线留意中 · 每12秒检查 · 仅页面可见时');
}
function savedHigh() { try { return Number(sessionStorage.getItem('birthday.admin.seen.' + user)) || 0; } catch { return 0; } }
function beginPolling() {
  const name = user;
  poller = createWishPoller({ fetchStats: () => api('wishes/stats'), onStats: stats,
    onNew: () => { $('#notice').hidden = false; text('#notice-text', '有新的心愿来信，等你慢慢读。'); },
    onError: (error) => { if (user) text('#poll-status', error.message + ' 页面可见时稍后检查。'); },
    remember: (high) => { try { sessionStorage.setItem('birthday.admin.seen.' + name, String(high)); } catch { /* No sensitive body stored. */ } },
  }); poller.start(savedHigh());
}
async function loadList() {
  const version = epoch, request = ++pageRequest;
  text('#app-message', ''); $('#wish-list').setAttribute('aria-busy', 'true');
  const query = new URLSearchParams({ page, pageSize });
  if (filter === 'unread') query.set('unreadOnly', 'true');
  if (filter === 'read') query.set('isRead', 'true');
  try {
    const result = await api('wishes?' + query);
    if (!user || epoch !== version || request !== pageRequest) return;
    $('#wish-list').replaceChildren(); text('#list-total', ' / ' + result.totalCount + ' 封');
    for (const wish of result.items) {
      const row = document.createElement('button'); row.className = 'wish-row'; row.type = 'button';
      const icon = document.createElement('span'); icon.className = 'row-icon'; icon.textContent = '♡'; icon.setAttribute('aria-hidden','true');
      const body = document.createElement('span'); body.className = 'row-body';
      const title = document.createElement('span'); title.className = 'row-title'; title.textContent = '心愿来信 #' + wish.wishId;
      const badge = document.createElement('span'); badge.className = 'badge' + (wish.isRead ? ' read' : ''); badge.textContent = wish.isRead ? '已读' : '未读';
      const preview = document.createElement('span'); preview.className = 'preview'; preview.textContent = wish.contentPreview;
      const time = document.createElement('span'); time.className = 'row-time'; time.textContent = formatTime(wish.createdAt); time.title = wish.createdAt;
      const arrow = document.createElement('span'); arrow.textContent = '→'; time.append(arrow);
      title.append(badge); body.append(title, preview); row.append(icon, body, time);
      row.addEventListener('click', () => void showDetail(wish.wishId)); $('#wish-list').append(row);
    }
    if (!result.items.length) { const empty = document.createElement('p'); empty.className = 'empty'; empty.textContent = '这里还没有来信，期待下一份小心愿。'; $('#wish-list').append(empty); }
    text('#page-info', '第 ' + result.currentPage + ' 页 / 共 ' + result.totalPages + ' 页');
    $('#previous').disabled = page <= 1; $('#next').disabled = page >= result.totalPages;
  } catch (error) { if (user && epoch === version && request === pageRequest) text('#app-message', error.message); }
  finally { if (request === pageRequest) $('#wish-list').removeAttribute('aria-busy'); }
}
function renderDetail(wish) {
  currentDetail = wish; text('#detail-content', wish.content); text('#detail-meta', '#' + wish.wishId + ' · ' + formatTime(wish.createdAt));
  $('#detail-meta').title = wish.createdAt; text('#detail-source', '来源：' + wish.source);
  text('#detail-status', wish.isRead ? '已读' : '未读'); $('#detail-status').className = 'badge' + (wish.isRead ? ' read' : '');
  $('#mark-read').disabled = wish.isRead || markBusy; text('#mark-read', wish.isRead ? '已读 · 已认真收藏 ♡' : '标记为已读 ♡');
  $('#list-view').hidden = true; $('#detail-view').hidden = false;
}
async function showDetail(id) {
  const version = epoch, request = ++detailRequest; text('#app-message', '正在展开来信…');
  try { const result = await api('wishes/' + id); if (user && epoch === version && request === detailRequest) { renderDetail(result); text('#app-message', ''); } }
  catch (error) { if (user && epoch === version) text('#app-message', error.message); }
}
async function openDashboard() {
  const version = epoch, me = await api('me'); if (epoch !== version) return;
  user = me.username; csrf = undefined; text('#admin-name', me.username); $('#login-view').hidden = true; $('#dashboard').hidden = false;
  $('#detail-view').hidden = true; $('#list-view').hidden = false; $('#notice').hidden = true; page = 1;
  await token(); if (epoch !== version || !user) return;
  beginPolling(); await loadList();
}
$('#toggle-password').addEventListener('click', () => {
  const show = $('#password').type === 'password'; $('#password').type = show ? 'text' : 'password';
  $('#toggle-password').setAttribute('aria-pressed', String(show)); $('#toggle-password').setAttribute('aria-label', show ? '隐藏密码' : '显示密码'); text('#toggle-password', show ? '隐藏' : '显示');
});
$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (loginBusy) return; loginBusy = true; $('#login-submit').disabled = true; text('#login-message', '正在验证身份…');
  try { await mutate('login', 'POST', { username: $('#username').value, password: $('#password').value }); $('#password').value = ''; await openDashboard(); }
  catch (error) { text('#login-message', error.message); }
  finally { loginBusy = false; $('#login-submit').disabled = false; }
});
$('#logout').addEventListener('click', async () => {
  if ($('#logout').disabled) return; $('#logout').disabled = true; poller?.stop();
  try { await mutate('logout','POST'); clearProtected('已安全退出。'); }
  catch (error) { if (user) { text('#app-message', '退出尚未确认：' + error.message); beginPolling(); } }
  finally { $('#logout').disabled = false; }
});
document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
  filter = button.dataset.filter; page = 1; document.querySelectorAll('[data-filter]').forEach((item) => {
    item.classList.toggle('selected', item === button); item.setAttribute('aria-pressed', String(item === button));
  }); void loadList();
}));
$('#page-size').addEventListener('change', () => { pageSize = Number($('#page-size').value); page = 1; void loadList(); });
$('#previous').addEventListener('click', () => { if (page > 1) { --page; void loadList(); } });
$('#next').addEventListener('click', () => { ++page; void loadList(); });
$('#refresh').addEventListener('click', () => { void loadList(); poller?.visibilityChanged(); });
function back() { ++detailRequest; currentDetail = null; $('#detail-view').hidden = true; $('#list-view').hidden = false; text('#detail-content',''); void loadList(); }
$('#back').addEventListener('click', back); $('#nav-wishes').addEventListener('click', back);
$('#mark-read').addEventListener('click', async () => {
  if (!currentDetail || currentDetail.isRead || markBusy) return;
  const version = epoch, id = currentDetail.wishId; markBusy = true; $('#mark-read').disabled = true;
  try { const result = await mutate('wishes/' + id + '/read','PATCH');
    if (user && epoch === version) { if (currentDetail?.wishId === id) renderDetail(result); poller?.visibilityChanged(); text('#app-message','已按服务器结果更新。'); }
  } catch (error) { if (user && epoch === version) text('#app-message','结果尚未确认，请重新打开详情核实。' + error.message); }
  finally { markBusy = false; if (currentDetail) $('#mark-read').disabled = currentDetail.isRead; }
});
$('#notice-refresh').addEventListener('click', () => { $('#notice').hidden = true; page = 1; back(); });
$('#notice-close').addEventListener('click', () => { $('#notice').hidden = true; });
document.addEventListener('visibilitychange', () => { poller?.visibilityChanged(); if (document.hidden) text('#poll-status','页面已隐藏，暂停检查'); });
window.addEventListener('pagehide', () => poller?.stop());
window.addEventListener('pageshow', (event) => { if (event.persisted) { clearProtected(); void openDashboard().catch(() => clearProtected()); } });
void openDashboard().catch(() => clearProtected());
