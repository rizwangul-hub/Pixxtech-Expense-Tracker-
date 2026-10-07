import test from 'node:test';
import assert from 'node:assert/strict';
import { getAgreedMonthlyRent } from '../services/rentPricing.js';

test('active agreement rent overrides a stale property unit rent', () => {
  assert.equal(
    getAgreedMonthlyRent({ agreedRent: 40000 }, { monthlyRent: 44000 }),
    44000
  );
});

test('property unit rent remains the fallback when no active agreement exists', () => {
  assert.equal(getAgreedMonthlyRent({ agreedRent: 40000 }, null), 40000);
});

test('missing or invalid rent values resolve to zero', () => {
  assert.equal(getAgreedMonthlyRent({}, null), 0);
  assert.equal(getAgreedMonthlyRent({ agreedRent: 'invalid' }, null), 0);
});
