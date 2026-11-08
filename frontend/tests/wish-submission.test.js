import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/js/state.js';
import { createSubmissionController } from '../src/js/services/submissionController.js';
import { createSubmissionJournal, submissionJournalKey } from '../src/js/services/submissionJournal.js';

const receipt = { wishId: 91, createdAt: '2026-11-01T00:30:21.1772829+00:00', isRead: false, source: '王若溪大王生日网站' };
const saved = { status: 'success', httpStatus: 201, receipt, canRetry: false, requiresConfirmation: false };
const memory = () => { const values = new Map(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) }; };
function setup(handler, { storage = memory(), now = () => 1000, ownerId = 'tab-one' } = {}) {
  let calls = 0;
  const store = createStore({ unlocked: true, wishDraft: '我的心愿' });
  const journal = createSubmissionJournal(storage);
  const controller = createSubmissionController({ store, journal, now, ownerId,
    api: { configured: true, submit: async (content) => { calls++; return handler(content); } }, createId: () => 'attempt-one' });
  return { store, journal, controller, storage, calls: () => calls };
}

test('double click and scene switches cannot create concurrent POSTs', async () => {
  let finish;
  const app = setup(() => new Promise((resolve) => { finish = resolve; }));
  const first = app.controller.submit();
  app.store.patch({ scene: 'cake' });
  await app.controller.submit();
  assert.equal(app.calls(), 1); assert.equal(app.controller.current().status, 'submitting');
  finish(saved); await first;
  assert.equal(app.store.get().wishDraft, ''); assert.equal(app.controller.current().receipt.wishId, 91);
  await app.controller.submit(); assert.equal(app.calls(), 1);
});

test('clear rejection retains the exact draft and permits a manual retry', async () => {
  const app = setup(() => ({ status: 'error', httpStatus: 400, canRetry: true, requiresConfirmation: false }));
  await app.controller.submit(); assert.equal(app.store.get().wishDraft, '我的心愿');
  assert.equal(app.journal.read(), null); await app.controller.submit(); assert.equal(app.calls(), 2);
});

test('429 countdown blocks retry until its deadline without scheduling a POST', async () => {
  let now = 1000;
  const app = setup(() => ({ status: 'error', httpStatus: 429, retryAt: 5000, canRetry: true, requiresConfirmation: false }), { now: () => now });
  await app.controller.submit(); await app.controller.submit(); assert.equal(app.calls(), 1);
  now = 5001; await app.controller.submit(); assert.equal(app.calls(), 2);
});

for (const status of ['unknown', 'error']) test(status + ' requiring review survives reload and does not auto-resubmit', async () => {
  const app = setup(() => ({ status, httpStatus: status === 'error' ? 503 : undefined, canRetry: false, requiresConfirmation: true }));
  await app.controller.submit(); await app.controller.submit(); assert.equal(app.calls(), 1);
  const reloaded = setup(() => { throw new Error('Must not send'); }, { storage: app.storage });
  assert.equal(reloaded.controller.current().requiresConfirmation, true);
  assert.equal(reloaded.store.get().wishDraft, '我的心愿');
  await reloaded.controller.submit(); assert.equal(reloaded.calls(), 0); assert.equal(reloaded.controller.startNew(), false);
});

test('reloading during in-flight POST recovers unknown and preserves the attempted text', () => {
  const storage = memory();
  const journal = createSubmissionJournal(storage);
  journal.write({ status: 'submitting', attemptId: 'old', content: '尚待核实的心愿' });
  const app = setup(() => saved, { storage });
  assert.equal(app.controller.current().status, 'unknown');
  assert.equal(app.store.get().wishDraft, '尚待核实的心愿'); assert.equal(app.calls(), 0);
});

test('unload marks an in-flight request uncertain without retrying', async () => {
  let finish;
  const app = setup(() => new Promise((resolve) => { finish = resolve; }));
  const request = app.controller.submit(); app.controller.markInterrupted();
  assert.equal(app.journal.read().status, 'unknown'); assert.equal(app.calls(), 1);
  finish(saved); await request; assert.equal(app.controller.current().status, 'success');
});

test('201 with an invalid receipt cannot clear a draft or allow retry', async () => {
  const app = setup(() => ({ ...saved, receipt: { wishId: 1 } }));
  await app.controller.submit(); assert.equal(app.controller.current().status, 'unknown');
  assert.equal(app.store.get().wishDraft, '我的心愿');
});

test('durable journal write failure prevents any network call', async () => {
  const storage = memory(); storage.setItem = () => { throw new Error('quota'); };
  const app = setup(() => saved, { storage });
  await app.controller.submit(); assert.equal(app.calls(), 0); assert.equal(app.store.get().wishDraft, '我的心愿');
});

test('corrupted persisted state fails closed', async () => {
  const storage = memory(); storage.setItem(submissionJournalKey, '{broken');
  const app = setup(() => saved, { storage }); await app.controller.submit(); assert.equal(app.calls(), 0);
});

test('confirmed success clears the draft and requires explicit new-wish action', async () => {
  const app = setup(() => saved); await app.controller.submit();
  assert.equal(app.store.get().wishDraft, ''); assert.equal(app.controller.startNew(), true);
  assert.equal(app.controller.current().status, 'idle'); assert.equal(app.journal.read(), null);
});

test('a receipt from another tab does not clear this tabs unrelated draft', async () => {
  const storage = memory(); createSubmissionJournal(storage).write({ ...saved, attemptId: 'other', ownerId: 'tab-other', content: '' });
  const app = setup(() => saved, { storage });
  assert.equal(app.store.get().wishDraft, '我的心愿');
  await app.controller.submit(); assert.equal(app.calls(), 1);
});

test('empty or oversized local content never calls API', async () => {
  const app = setup(() => saved);
  for (const content of [null, 42, {}, '', ' \u3000\n', 'x'.repeat(2001)]) { app.store.patch({ wishDraft: content }); await app.controller.submit(); }
  assert.equal(app.calls(), 0);
});

test('a persisted receipt without HTTP 201 evidence is restored as unknown', () => {
  const storage = memory();
  createSubmissionJournal(storage).write({ status: 'success', attemptId: 'corrupt', receipt, content: '' });
  const app = setup(() => saved, { storage });
  assert.equal(app.controller.current().status, 'unknown');
  assert.equal(app.calls(), 0);
});
