import assert from 'node:assert/strict';
import test from 'node:test';
import { commit, loadData, StaleDataError, type Data } from '../src/store.ts';

class MemoryStorage {
  values = new Map<string, string>();
  writes = 0;
  failWrites = false;
  get length() { return this.values.size; }
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.writes += 1;
    this.values.set(key, String(value));
  }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null; }
}

const key = 'diao-tham.data.v1';
function fixture(): Data {
  return {
    version: 1,
    captures: [{ id: 'capture-1', text: 'พรุ่งนี้ส่งสไลด์', referenceDate: '2026-11-16', timeZone: 'Asia/Bangkok', createdAt: '2026-11-16T06:00:00Z', status: 'pending' }],
    tasks: [],
  };
}

function withStorage(run: (storage: MemoryStorage) => void) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  try { run(storage); }
  finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

test('successful commit persists a deep copy without mutating its input', () => withStorage((storage) => {
  const original = fixture();
  storage.values.set(key, JSON.stringify(original));
  const updated = commit(original, (copy) => { copy.captures[0].status = 'reviewed'; });
  assert.equal(updated.captures[0].status, 'reviewed');
  assert.equal(original.captures[0].status, 'pending');
  assert.deepEqual(JSON.parse(storage.getItem(key)!), updated);
  assert.equal(storage.writes, 1);
}));

test('failed durable write does not mutate current memory or old persisted data', () => withStorage((storage) => {
  const original = fixture();
  storage.values.set(key, JSON.stringify(original));
  const previous = storage.getItem(key);
  storage.failWrites = true;
  assert.throws(() => commit(original, (copy) => { copy.captures[0].status = 'reviewed'; }), /QuotaExceededError/);
  assert.equal(original.captures[0].status, 'pending');
  assert.equal(storage.getItem(key), previous);
  assert.equal(storage.writes, 0);
}));

test('failed patch does not write partial state or mutate current memory', () => withStorage((storage) => {
  const original = fixture();
  storage.values.set(key, JSON.stringify(original));
  assert.throws(() => commit(original, (copy) => {
    copy.captures[0].text = 'changed';
    throw new Error('patch failed');
  }), /patch failed/);
  assert.equal(original.captures[0].text, 'พรุ่งนี้ส่งสไลด์');
  assert.equal(storage.writes, 0);
}));

test('malformed or unsupported saved data is rejected without overwriting it', () => withStorage((storage) => {
  for (const broken of ['{broken json', '{"version":2,"captures":[],"tasks":[]}', '{"version":1,"captures":null,"tasks":[]}']) {
    storage.values.set(key, broken);
    assert.throws(() => loadData(), Error);
    assert.equal(storage.getItem(key), broken);
  }
  assert.equal(storage.writes, 0);
}));

test('first load returns an empty store without creating a write', () => withStorage((storage) => {
  assert.deepEqual(loadData(), { version: 1, captures: [], tasks: [] });
  assert.equal(storage.writes, 0);
}));

test('a stale tab cannot overwrite a newer capture from another tab', () => withStorage((storage) => {
  const tabA = fixture();
  storage.values.set(key, JSON.stringify(tabA));
  const tabB = loadData();
  const newer = commit(tabB, (copy) => { copy.captures[0].text = 'Saved in another tab'; });
  let patched = false;
  assert.throws(() => commit(tabA, (copy) => { patched = true; copy.captures[0].status = 'reviewed'; }), StaleDataError);
  assert.equal(patched, false);
  assert.deepEqual(loadData(), newer);
  assert.equal(storage.writes, 1);
}));

test('a tab with old data does not recreate it after browser storage is cleared', () => withStorage((storage) => {
  const old = fixture();
  assert.throws(() => commit(old, (copy) => { copy.captures[0].status = 'reviewed'; }), StaleDataError);
  assert.equal(storage.getItem(key), null);
  assert.equal(storage.writes, 0);
}));

test('a first capture can still be saved to an empty browser store', () => withStorage(() => {
  const empty = loadData();
  const updated = commit(empty, (copy) => { copy.captures.push(fixture().captures[0]); });
  assert.deepEqual(loadData(), updated);
}));
