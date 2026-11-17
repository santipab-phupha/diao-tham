import test from 'node:test';
import assert from 'node:assert/strict';
import { checkLocalCapability } from '../src/local-capability.ts';

test('checks the same Thai and English input/output language options as extraction without submitting message text', async () => {
  let observed: unknown;
  const result = await checkLocalCapability('พรุ่งนี้ send the slides', {
    isSecureContext: true,
    languageModel: { availability: async (options) => { observed = options; return 'downloadable'; } },
  });
  assert.deepEqual(observed, {
    expectedInputs: [{ type: 'text', languages: ['en', 'th'] }],
    expectedOutputs: [{ type: 'text', languages: ['en', 'th'] }],
  });
  assert.deepEqual(result, { status: 'downloadable', languages: ['en', 'th'] });
});

test('reports insecure context and a missing browser API without claiming availability', async () => {
  let called = false;
  const insecure = await checkLocalCapability('Hello', {
    isSecureContext: false,
    languageModel: { availability: async () => { called = true; return 'available'; } },
  });
  assert.equal(called, false);
  assert.equal(insecure.reason, 'insecure-context');
  assert.equal((await checkLocalCapability('Hello', { isSecureContext: true })).reason, 'missing-api');
});

test('reports supported availability states, unsupported options, and errors without exposing error text', async () => {
  for (const state of ['available', 'downloadable', 'downloading', 'unavailable'] as const) {
    assert.equal((await checkLocalCapability('Hello', { isSecureContext: true, languageModel: { availability: async () => state } })).status, state);
  }
  const unsupported = await checkLocalCapability('Hello', {
    isSecureContext: true,
    languageModel: { availability: async () => { throw new DOMException('details', 'NotSupportedError'); } },
  });
  assert.deepEqual(unsupported, { status: 'unsupported', languages: ['en'], reason: 'unsupported-options' });
  const failure = await checkLocalCapability('Hello', {
    isSecureContext: true,
    languageModel: { availability: async () => { throw new Error('private details'); } },
  });
  assert.deepEqual(failure, { status: 'error', languages: ['en'], reason: 'check-failed' });
  const unexpected = await checkLocalCapability('Hello', { isSecureContext: true, languageModel: { availability: async () => 'new-value' } });
  assert.equal(unexpected.reason, 'unexpected-result');
});
