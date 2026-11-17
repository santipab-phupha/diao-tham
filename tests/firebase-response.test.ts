import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageLanguages, parseFirebaseResponse, validateSettings } from '../src/firebase.ts';

const source = 'พรุ่งนี้ส่งสไลด์ก่อนเที่ยง แล้วทักร้านเรื่องใบเสร็จ';
const row = {
  title: 'ส่งสไลด์', dueDate: '2026-11-17', dueTime: '12:00',
  evidence: 'พรุ่งนี้ส่งสไลด์ก่อนเที่ยง', needsReview: false, reviewReason: '',
};

test('accepts grounded task data and preserves missing deadline', () => {
  const tasks = parseFirebaseResponse(JSON.stringify({ tasks: [row, {
    ...row, title: 'ทักร้านเรื่องใบเสร็จ', dueDate: null, dueTime: null,
    evidence: 'ทักร้านเรื่องใบเสร็จ',
  }] }), source);
  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].dueDate, '2026-11-17');
  assert.equal(tasks[1].dueDate, null);
  assert.notEqual(tasks[0].id, tasks[1].id);
});

test('accepts no actionable tasks', () => {
  assert.deepEqual(parseFirebaseResponse('{"tasks":[]}', 'ส่งเรียบร้อยแล้ว'), []);
});

test('rejects invented source evidence', () => {
  assert.throws(() => parseFirebaseResponse(JSON.stringify({ tasks: [{ ...row, evidence: 'ซื้อกาแฟ' }] }), source));
});

test('rejects invalid dates and times instead of normalizing them silently', () => {
  for (const override of [{ dueDate: '2026-02-30' }, { dueDate: 'next Friday' }, { dueTime: '25:00' }, { dueTime: 'evening' }]) {
    assert.throws(() => parseFirebaseResponse(JSON.stringify({ tasks: [{ ...row, ...override }] }), source));
  }
});

test('rejects oversized lists and missing required fields', () => {
  assert.throws(() => parseFirebaseResponse(JSON.stringify({ tasks: Array.from({ length: 13 }, () => row) }), source));
  assert.throws(() => parseFirebaseResponse(JSON.stringify({ tasks: [{ title: 'ส่งสไลด์' }] }), source));
  assert.throws(() => parseFirebaseResponse('{"message":"hello"}', source));
});

test('requires Firebase and App Check configuration', () => {
  const issues = validateSettings({ firebaseConfig: {}, appCheckSiteKey: '', cloudModel: '' });
  assert.ok(issues.some((issue) => issue.includes('apiKey')));
  assert.ok(issues.some((issue) => issue.includes('App Check')));
});

test('rejects unexpected or private keys mixed into public Web configuration', () => {
  const issues = validateSettings({
    firebaseConfig: { apiKey: 'public-id', projectId: 'example-project', appId: 'example-app', private_key: 'not-an-accepted-field' } as never,
    appCheckSiteKey: 'public-site-key', cloudModel: 'gemini-3.5-flash-lite',
  });
  assert.ok(issues.some((issue) => issue.includes('private/service-account')));
});

test('message languages remain independent of an English interface', () => {
  assert.deepEqual(messageLanguages('พรุ่งนี้ส่งสไลด์ at noon'), ['en', 'th']);
  assert.deepEqual(messageLanguages('Please send the slides tomorrow at noon'), ['en']);
});
