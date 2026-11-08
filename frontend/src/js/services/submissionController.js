import { unknownResult, validReceipt } from './wishesApi.js';
export const idleSubmission = () => ({ status: 'idle', canRetry: true, requiresConfirmation: false });
const storageError = () => ({ status: 'error', reason: 'storage', canRetry: true, requiresConfirmation: false,
  message: '浏览器无法可靠保存投递状态，本次没有发送。请允许本地存储后再试。' });

export function createSubmissionController({ store, api, journal, now = Date.now,
  createId = () => crypto.randomUUID(), ownerId = 'current-page', withLock = (callback) => callback() }) {
  let inFlight = false;
  const current = () => store.get().wishSubmission || idleSubmission();
  const publish = (state) => store.patch({ wishSubmission: Object.freeze(state) });
  function recover() {
    if (inFlight) return;
    try {
      const saved = journal.read();
      if (!saved) return;
      if (saved.status === 'success' && saved.httpStatus === 201 && validReceipt(saved.receipt)) {
        if (saved.ownerId && saved.ownerId !== ownerId) return;
        store.patch({ wishDraft: '' }); publish({ ...saved, content: undefined, canRetry: false }); return;
      }
      const recovered = saved.status === 'submitting' || saved.status === 'success'
        ? { ...unknownResult('interrupted'), attemptId: saved.attemptId, content: saved.content || '' }
        : saved;
      if (recovered.content) store.patch({ wishDraft: recovered.content });
      publish(recovered);
      if (saved.status === 'submitting') journal.write(recovered);
    } catch {
      publish({ ...unknownResult('journal-unreadable'),
        message: '无法读取之前的投递状态。为避免重复保存，请先联系站点所有者核实，暂不重发。' });
    }
  }
  recover();
  async function submit() {
    if (inFlight || ['submitting', 'unknown', 'success'].includes(current().status)
        || current().canRetry === false || current().requiresConfirmation || (current().retryAt || 0) > now()) return current();
    const content = store.get().wishDraft;
    if (typeof content !== 'string' || !content.trim() || content.length > 2000) {
      const result = { status: 'error', reason: 'validation', canRetry: true, requiresConfirmation: false,
        message: typeof content !== 'string' || !content.trim() ? '先写下一点心愿吧 ♡' : '心愿不能超过2000个UTF-16代码单元。' };
      publish(result); return result;
    }
    if (!api.configured) { const result = await api.submit(content); publish(result); return result; }
    inFlight = true; // Acquire before any await, and keep across scene changes.
    try {
      return await withLock(async () => {
        let previous;
        try { previous = journal.read(); } catch { const result = storageError(); publish(result); return result; }
        if (previous && !(previous.status === 'success' && previous.ownerId && previous.ownerId !== ownerId)) {
          inFlight = false; recover(); return current();
        }
        const attemptId = createId();
        const pending = { status: 'submitting', attemptId, ownerId, content, canRetry: false, requiresConfirmation: false };
        try { journal.write(pending); } catch { const result = storageError(); publish(result); return result; }
        publish(pending);
        let result;
        try { result = await api.submit(content); } catch { result = unknownResult('unexpected'); }
        result = { ...result, attemptId, ownerId };
        if (result.status === 'success' && (!validReceipt(result.receipt) || result.httpStatus !== 201)) result = { ...unknownResult('invalid-receipt'), attemptId };
        if (result.status === 'success') {
          // Save the confirmed receipt before clearing the submitted draft.
          try { journal.write({ ...result, content: '' }); } catch { /* Keep the older pending guard if storage fails. */ }
          store.patch({ wishDraft: '' }); publish(result);
        } else if (result.requiresConfirmation || result.status === 'unknown') {
          result = { ...result, content, canRetry: false, requiresConfirmation: true };
          try { journal.write(result); } catch { /* Existing pending journal remains a conservative guard. */ }
          publish(result);
        } else {
          try { journal.clear(); } catch { result = { ...result, canRetry: false, requiresConfirmation: true, message: '无法清理之前的投递标记，请联系站点所有者核实后再试。' }; }
          publish(result);
        }
        return result;
      });
    } catch {
      const result = { ...unknownResult('concurrent-or-storage'), content };
      publish(result); return result;
    } finally { inFlight = false; }
  }
  function startNew() {
    if (inFlight || current().status !== 'success') return false;
    try { journal.clear(); } catch { return false; }
    store.patch({ wishDraft: '' }); publish(idleSubmission()); return true;
  }
  function markInterrupted() {
    if (current().status !== 'submitting') return;
    const interrupted = { ...unknownResult('interrupted'), attemptId: current().attemptId, content: store.get().wishDraft };
    try { journal.write(interrupted); } catch { /* The pending entry already prevents reopening from resending. */ }
    publish(interrupted);
  }
  return { submit, startNew, markInterrupted, recover, current };
}
