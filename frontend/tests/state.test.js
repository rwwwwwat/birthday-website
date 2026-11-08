import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/js/state.js';

test('ceremonial unlock gates scene navigation and rejects unknown scenes', () => {
  const store = createStore();
  assert.equal(store.patch({ scene: 'wishes' }), false);
  assert.equal(store.get().scene, 'login');
  assert.equal(store.patch({ unlocked: true, scene: 'memories' }), true);
  assert.equal(store.patch({ scene: 'unknown' }), false);
  assert.equal(store.get().scene, 'memories');
});

test('draft and completed interactions survive scene navigation', () => {
  const store = createStore();
  store.patch({ unlocked: true, scene: 'wishes', wishDraft: '一起去看海', letterOpened: true, candleOut: true });
  store.patch({ scene: 'memories' });
  store.patch({ scene: 'wishes' });
  assert.equal(store.get().wishDraft, '一起去看海');
  assert.equal(store.get().letterOpened, true);
  assert.equal(store.get().candleOut, true);
});
