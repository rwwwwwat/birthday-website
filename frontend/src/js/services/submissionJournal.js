export const submissionJournalKey = 'birthday.wishSubmission.v1';
export function createSubmissionJournal(storage) {
  return {
    read() {
      if (!storage) throw new Error('Persistent storage unavailable');
      const raw = storage.getItem(submissionJournalKey);
      if (raw === null) return null;
      const record = JSON.parse(raw);
      if (!record || record.version !== 1 || typeof record.attemptId !== 'string'
          || !['submitting', 'unknown', 'error', 'success'].includes(record.status)
          || (record.status !== 'success' && (typeof record.content !== 'string' || record.content.length > 2000))) {
        throw new Error('Invalid submission journal');
      }
      return record;
    },
    write(record) {
      if (!storage) throw new Error('Persistent storage unavailable');
      const raw = JSON.stringify({ ...record, version: 1 });
      storage.setItem(submissionJournalKey, raw);
      if (storage.getItem(submissionJournalKey) !== raw) throw new Error('Submission journal not durable');
    },
    clear() {
      if (!storage) throw new Error('Persistent storage unavailable');
      storage.removeItem(submissionJournalKey);
    },
  };
}
