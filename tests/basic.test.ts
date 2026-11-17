import assert from 'node:assert/strict';
import test from 'node:test';
import { extractBasic } from '../src/basic.ts';
import type { ExtractContext } from '../src/types.ts';

const context: ExtractContext = { referenceDate: '2026-11-16', timeZone: 'Asia/Bangkok', locale: 'th' };

test('Thai mixed message becomes two editable suggestions with only stated dates', () => {
  const source = 'พรุ่งนี้ช่วยส่งสไลด์ก่อนเที่ยง แล้วอย่าลืมทักร้านเรื่องใบเสร็จด้วยนะ';
  const result = extractBasic(source, context);
  assert.equal(result.engine, 'basic');
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].dueDate, '2026-11-17');
  assert.equal(result.candidates[0].dueTime, '12:00');
  assert.equal(result.candidates[1].dueDate, null);
  for (const candidate of result.candidates) {
    assert.ok(source.includes(candidate.evidence));
    assert.equal(candidate.needsReview, true);
    assert.ok(candidate.reviewReason.includes('กฎพื้นฐาน'));
  }
});

test('English conjunctions and deadline are extracted without a work start time', () => {
  const result = extractBasic('Please send the slides tomorrow before noon and call the shop', { ...context, locale: 'en' });
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].dueDate, '2026-11-17');
  assert.equal(result.candidates[0].dueTime, '12:00');
  assert.equal(result.candidates[1].dueTime, null);
  assert.match(result.candidates[0].reviewReason, /deadline/);
});

test('normal conjunction in an object does not become another task', () => {
  const result = extractBasic('Buy bread and milk and call the shop', context);
  assert.equal(result.candidates.length, 2);
  assert.equal(result.candidates[0].evidence, 'Buy bread and milk');
});

test('completed messages and greetings do not become tasks', () => {
  const result = extractBasic('พี่เอส่งไฟล์เรียบร้อยแล้ว\nทำเสร็จแล้ว\nสวัสดีครับ ขอบคุณมาก\nI already sent the file\nI finished the slides already', context);
  assert.equal(result.candidates.length, 0);
});

test('weekday ambiguity and vague evening remain unresolved', () => {
  const result = extractBasic('ศุกร์หน้าฝากเช็กเอกสารหน่อย เย็น ๆ', context);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].dueDate, null);
  assert.equal(result.candidates[0].dueTime, null);
  assert.match(result.candidates[0].reviewReason, /ยืนยันวันที่/);
});

test('relative dates use message date, with correct month and year rollover', () => {
  assert.equal(extractBasic('พรุ่งนี้ส่งไฟล์', { ...context, referenceDate: '2026-12-31' }).candidates[0].dueDate, '2027-01-01');
  assert.equal(extractBasic('พรุ่งนี้ส่งไฟล์', { ...context, referenceDate: '2026-11-15' }).candidates[0].dueDate, '2026-11-16');
  assert.equal(extractBasic('มะรืนซื้อไข่', { ...context, referenceDate: '2028-02-28' }).candidates[0].dueDate, '2028-03-01');
});

test('explicit valid dates and times work; invalid dates are not normalized', () => {
  const result = extractBasic('ส่งไฟล์ 2026-11-30 เวลา 09:30\nส่งไฟล์ 2026-02-30', context);
  assert.equal(result.candidates[0].dueDate, '2026-11-30');
  assert.equal(result.candidates[0].dueTime, '09:30');
  assert.equal(result.candidates[1].dueDate, null);
  assert.match(result.candidates[1].reviewReason, /ไม่ถูกต้อง/);
});

test('bullet lists preserve evidence and create unique candidate identities', () => {
  const result = extractBasic('- ซื้อไข่\n2. ทักร้าน\n• เขียนสไลด์', context);
  assert.deepEqual(result.candidates.map((candidate) => candidate.evidence), ['ซื้อไข่', 'ทักร้าน', 'เขียนสไลด์']);
  assert.equal(new Set(result.candidates.map((candidate) => candidate.id)).size, 3);
  assert.ok(result.durationMs >= 0);
});
