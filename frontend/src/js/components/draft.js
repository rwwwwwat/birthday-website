const key = 'birthday.wishDraft.v1';
export function readDraft() {
  try { return sessionStorage.getItem(key)?.slice(0, 2000) || ''; } catch { return ''; }
}
export function saveDraft(value) {
  try { sessionStorage.setItem(key, value); return true; } catch { return false; }
}
