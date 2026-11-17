import assert from 'node:assert/strict';
import test from 'node:test';
import { calendarEventStorageKey, markedEventForTask, setCalendarToken, syncMarkedTasks } from '../src/calendar.ts';
import type { Task } from '../src/types.ts';

function task(overrides: Partial<Task> = {}): Task {
  return { id: '01234567-89ab-4cde-8fab-0123456789ab', title: 'Send slides', dueDate: null, dueTime: null, evidence: 'Send slides', needsReview: false, reviewReason: '', captureId: 'source', createdAt: '2026-11-01T00:00:00Z', completedAt: null, engine: 'cloud', ...overrides };
}

test('calendar event links stay separate across signed-in accounts and legacy data', () => {
  const links = new Map<string, string>();
  links.set(calendarEventStorageKey('task-1', null), 'legacy event');
  links.set(calendarEventStorageKey('task-1', 'user-a'), 'user A event');
  assert.equal(links.get(calendarEventStorageKey('task-1', 'user-b')), undefined);
  assert.equal(links.get(calendarEventStorageKey('task-1', 'user-a')), 'user A event');
  assert.equal(links.get(calendarEventStorageKey('task-1', null)), 'legacy event');
});

test('date-only events have an exclusive next day end, independent of deadline', () => {
  const event = markedEventForTask(task({ calendarDate: '2028-02-29', dueDate: '2028-03-10', dueTime: '16:00' }), 'Asia/Bangkok');
  assert.deepEqual(event.start, { date: '2028-02-29' });
  assert.deepEqual(event.end, { date: '2028-03-01' });
  assert.equal(event.id, 'dtm0123456789ab4cde8fab0123456789ab');
  assert.throws(() => markedEventForTask(task({ calendarDate: '2026-02-29' }), 'Asia/Bangkok'), /valid calendar date/);
});

test('timed events use the chosen time zone rather than the computer zone, and reject DST gaps and ambiguity', () => {
  const event = markedEventForTask(task({ calendarDate: '2026-11-17', calendarTime: '14:00' }), 'America/New_York');
  assert.deepEqual(event.start, { dateTime: '2026-11-17T19:00:00.000Z', timeZone: 'America/New_York' });
  assert.deepEqual(event.end, { dateTime: '2026-11-17T19:30:00.000Z', timeZone: 'America/New_York' });
  assert.throws(() => markedEventForTask(task({ calendarDate: '2026-03-08', calendarTime: '02:30' }), 'America/New_York'), /missing or ambiguous/);
  assert.throws(() => markedEventForTask(task({ calendarDate: '2026-11-01', calendarTime: '01:30' }), 'America/New_York'), /missing or ambiguous/);
});

test('sync creates or safely updates only marked events and reports partial failures', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ method: string; url: string; headers: Headers; body: any }> = [];
  const first = task({ calendarDate: '2026-11-17' });
  const second = task({ id: '11234567-89ab-4cde-8fab-0123456789ab', title: 'Review', calendarDate: '2026-11-18', calendarTime: '09:00' });
  const third = task({ id: '21234567-89ab-4cde-8fab-0123456789ab', title: 'Unrelated collision', calendarDate: '2026-11-19' });
  setCalendarToken('test-token');
  globalThis.fetch = async (input, options = {}) => {
    const method = options.method || 'GET';
    const url = String(input);
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : undefined;
    calls.push({ method, url, headers: new Headers(options.headers), body });
    if (method === 'POST' && body.summary === first.title) return Response.json({ htmlLink: 'https://calendar.google.com/event/first' });
    if (method === 'POST') return new Response('', { status: 409 });
    if (method === 'GET' && url.includes('dtm11234567')) return Response.json({ etag: '"revision"', extendedProperties: { private: { diaoThamTaskId: second.id, diaoThamKind: 'marked-calendar-v1' } } });
    if (method === 'GET') return Response.json({ etag: '"other"', extendedProperties: { private: { diaoThamTaskId: 'another' } } });
    if (method === 'PATCH') return Response.json({ htmlLink: 'https://calendar.google.com/event/second' });
    throw new Error('Unexpected request');
  };
  try {
    const result = await syncMarkedTasks([first, second, third, task({ id: '31234567-89ab-4cde-8fab-0123456789ab' })], 'Asia/Bangkok');
    assert.deepEqual(result.map(item => item.status), ['created', 'updated', 'failed']);
    assert.match(result[2].error!, /unrelated event/);
    assert.equal(calls.filter(call => call.method === 'POST').length, 3);
    const patch = calls.find(call => call.method === 'PATCH')!;
    assert.equal(patch.headers.get('If-Match'), '"revision"');
    assert.deepEqual(Object.keys(patch.body).sort(), ['end', 'start', 'summary']);
    assert.ok(calls.every(call => call.headers.get('Authorization') === 'Bearer test-token'));
    assert.ok(calls.every(call => call.method !== 'DELETE'));
  } finally {
    globalThis.fetch = originalFetch;
    setCalendarToken(null);
  }
});

test('sync never sends requests without a Calendar token', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('unexpected'); };
  setCalendarToken(null);
  try {
    const result = await syncMarkedTasks([task({ calendarDate: '2026-11-17' })], 'Asia/Bangkok');
    assert.equal(called, false);
    assert.equal(result[0].status, 'failed');
    assert.match(result[0].error!, /Connect Google Calendar/);
  } finally { globalThis.fetch = originalFetch; }
});
