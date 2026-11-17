import assert from 'node:assert/strict';
import test from 'node:test';
import { googleProvider } from '../src/auth.ts';

test('Google sign-in requests Calendar access only when selected', () => {
  const scope = 'https://www.googleapis.com/auth/calendar.events.owned';
  assert.equal(googleProvider(false).getScopes().includes(scope), false);
  assert.equal(googleProvider(true).getScopes().includes(scope), true);
});
