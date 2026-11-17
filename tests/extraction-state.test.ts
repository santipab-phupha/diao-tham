import test from 'node:test';
import assert from 'node:assert/strict';
import { recordExtraction } from '../src/extraction-state.ts';
import type { Data } from '../src/store.ts';
import type { Extraction } from '../src/types.ts';

const original = (): Data => ({
  version: 1,
  captures: [{ id: 'capture', text: 'Send slides tomorrow', referenceDate: '2026-11-17', timeZone: 'Asia/Bangkok', createdAt: '2026-11-17T00:00:00Z', status: 'pending' }],
  tasks: [],
});
const extraction: Extraction = {
  engine: 'cloud', durationMs: 123,
  candidates: [{ id: 'task-1', title: 'Send slides', dueDate: '2026-11-18', dueTime: null, evidence: 'Send slides tomorrow', needsReview: false, reviewReason: '' }],
};

test('successful extraction records the tasks and keeps the original', () => {
  const data = original();
  assert.equal(recordExtraction(data, 'capture', extraction, '2026-11-17T01:00:00Z'), 1);
  assert.equal(data.captures[0].status, 'reviewed');
  assert.equal(data.captures[0].text, 'Send slides tomorrow');
  assert.deepEqual(data.tasks[0], { ...extraction.candidates[0], captureId: 'capture', createdAt: '2026-11-17T01:00:00Z', completedAt: null, engine: 'cloud' });
});

test('retries cannot duplicate tasks or restore deleted tasks for a reviewed capture', () => {
  const data = original();
  recordExtraction(data, 'capture', extraction, '2026-11-17T01:00:00Z');
  const retry = { ...extraction, candidates: [{ ...extraction.candidates[0], id: 'different-id' }] };
  assert.equal(recordExtraction(data, 'capture', retry, '2026-11-17T02:00:00Z'), 0);
  assert.equal(data.tasks.length, 1);
  data.tasks = [];
  assert.equal(recordExtraction(data, 'capture', retry, '2026-11-17T02:00:00Z'), 0);
  assert.deepEqual(data.tasks, []);
});

test('no-task extraction keeps the original available for retry', () => {
  const data = original();
  const empty = { ...extraction, candidates: [] };
  assert.equal(recordExtraction(data, 'capture', empty, '2026-11-17T01:00:00Z'), 0);
  assert.equal(data.captures[0].status, 'pending');
  assert.equal(data.captures[0].reviewDraft, undefined);
  assert.deepEqual(data.tasks, []);
});

test('an original that disappeared is never silently recreated', () => {
  const data = original();
  assert.throws(() => recordExtraction(data, 'missing', extraction, '2026-11-17T01:00:00Z'), /no longer available/);
  assert.deepEqual(data, original());
});
