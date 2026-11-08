import test from 'node:test';
import assert from 'node:assert/strict';
import { createWishPoller } from '../../backend/BirthdayWebsite.Api/wwwroot/admin/polling.js';
const flush = () => new Promise((resolve) => setImmediate(resolve));
function setup() {
  let visible = true, latest = 50, calls = 0, notices = 0, fail = false, errors = 0;
  const tasks = new Map(); let serial = 0;
  const poller = createWishPoller({ fetchStats: async () => { ++calls; if (fail) throw new Error('offline'); return { latestWishId: latest }; },
    onStats() {}, onNew() { ++notices; }, onError() { ++errors; }, visible: () => visible,
    schedule: (fn, interval) => { assert.equal(interval,12000); tasks.set(++serial,fn); return serial; }, cancel: (id) => tasks.delete(id) });
  return { poller, tasks, get calls() { return calls; }, get notices() { return notices; }, get errors() { return errors; },
    hide() { visible = false; poller.visibilityChanged(); }, show() { visible = true; poller.visibilityChanged(); }, latest: (id) => { latest = id; }, fail() { fail = true; },
    async tick() { const next = tasks.entries().next().value; assert.ok(next); tasks.delete(next[0]); await next[1](); } };
}
test('polling starts only when signed in; hidden pauses, visible resumes, logout stops', async () => {
  const s = setup(); assert.equal(s.calls,0); s.poller.start(); await flush(); assert.equal(s.calls,1);
  s.hide(); assert.equal(s.tasks.size,0); s.show(); await flush(); assert.equal(s.calls,2);
  s.poller.stop(); assert.equal(s.tasks.size,0); s.show(); await flush(); assert.equal(s.calls,2);
});
test('new IDs alert once; changes in unread count alone do not duplicate alerts', async () => {
  const s = setup(); s.poller.start(); await flush(); assert.equal(s.notices,0);
  s.latest(51); await s.tick(); assert.equal(s.notices,1); await s.tick(); assert.equal(s.notices,1);
  s.latest(49); await s.tick(); assert.equal(s.notices,1); s.latest(52); await s.tick(); assert.equal(s.notices,2); s.poller.stop();
});
test('stored high watermark prevents duplicate reminders after re-login', async () => {
  const s = setup(); s.poller.start(50); await flush(); assert.equal(s.notices,0); s.poller.stop();
  s.latest(51); s.poller.start(50); await flush(); assert.equal(s.notices,1); s.poller.stop();
});
test('old in-flight response cannot alert after logout', async () => {
  let finish, count = 0;
  const p = createWishPoller({ fetchStats: () => new Promise((resolve) => { finish = resolve; }), onStats: () => ++count,
    onNew: () => ++count, onError: () => ++count, visible: () => true });
  p.start(1); p.stop(); finish({latestWishId:2}); await flush(); assert.equal(count,0);
});
test('read-only polling failure schedules next visible check without posting', async () => {
  const s = setup(); s.fail(); s.poller.start(); await flush(); assert.equal(s.errors,1); assert.equal(s.tasks.size,1); s.hide(); assert.equal(s.tasks.size,0); s.poller.stop();
});
