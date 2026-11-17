import type { Data } from './store';
import type { Extraction } from './types';

/** Apply a completed extraction to a transaction copy; never duplicate an existing capture. */
export function recordExtraction(data: Data, captureId: string, extraction: Extraction, createdAt: string): number {
  const capture = data.captures.find(item => item.id === captureId);
  if (!capture) throw new Error('The original message is no longer available.');
  // A retried or reopened extraction must not overwrite edits or recreate deleted tasks.
  if (capture.status === 'reviewed' || data.tasks.some(task => task.captureId === captureId)) return 0;
  if (!extraction.candidates.length) {
    // Reopen the saved original so the user can retry AI or use the basic helper.
    delete capture.reviewDraft;
    return 0;
  }
  const tasks = extraction.candidates.map(candidate => ({
    ...candidate,
    title: candidate.title.trim(),
    captureId,
    createdAt,
    completedAt: null,
    engine: extraction.engine,
  }));
  data.tasks.unshift(...tasks);
  capture.status = 'reviewed';
  delete capture.reviewDraft;
  return tasks.length;
}
