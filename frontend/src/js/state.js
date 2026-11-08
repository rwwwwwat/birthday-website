import { readDraft, saveDraft } from './components/draft.js';
export const sceneIds = Object.freeze(['login', 'memories', 'letter', 'cake', 'wishes']);

export function createStore(initial = {}) {
  let state = Object.freeze({
    scene: 'login', unlocked: false, memoriesStarted: false,
    letterOpened: false, letterComplete: false, letterProgress: 0,
    wishMade: false, candleOut: false, wishDraft: '', musicEnabled: false,
    ...initial,
  });
  const listeners = new Set();
  return {
    get: () => state,
    patch(update) {
      if ('scene' in update && !sceneIds.includes(update.scene)) return false;
      if (update.scene && update.scene !== 'login' && !(state.unlocked || update.unlocked)) return false;
      state = Object.freeze({ ...state, ...update });
      listeners.forEach((listener) => listener(state));
      return true;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
export const store = createStore({ wishDraft: readDraft() });
let lastDraft = store.get().wishDraft;
store.subscribe((state) => {
  if (state.wishDraft !== lastDraft) { lastDraft = state.wishDraft; saveDraft(lastDraft); }
});
