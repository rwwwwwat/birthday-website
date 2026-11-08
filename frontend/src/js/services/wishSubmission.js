import { site } from '../../config/site.js';
import { store } from '../state.js';
import { createWishesApi } from './wishesApi.js';
import { createSubmissionJournal, submissionJournalKey } from './submissionJournal.js';
import { createSubmissionController } from './submissionController.js';

let storage;
try { storage = localStorage; } catch { /* Fail closed before any POST. */ }
let ownerId;
try {
  ownerId = sessionStorage.getItem('birthday.wishTab.v1') || crypto.randomUUID();
  sessionStorage.setItem('birthday.wishTab.v1', ownerId);
} catch { ownerId = crypto.randomUUID(); }
export const wishSubmission = createSubmissionController({
  store, ownerId, api: createWishesApi({ baseUrl: site.apiBaseUrl }), journal: createSubmissionJournal(storage),
  withLock: (callback) => navigator.locks
    ? navigator.locks.request('birthday-wish-submit', { ifAvailable: true }, (lock) => {
        if (!lock) throw new Error('Another page owns the submission lock');
        return callback();
      })
    : callback(),
});
window.addEventListener('pagehide', () => wishSubmission.markInterrupted());
window.addEventListener('storage', (event) => {
  if (event.key === submissionJournalKey) wishSubmission.recover();
});
