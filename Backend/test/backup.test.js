import test from 'node:test';
import assert from 'node:assert/strict';
import { EJSON } from 'bson';
import {
  getMonthDateRange,
  buildQueryForCollection,
  COLLECTION_DEFINITIONS,
  validateBackupZip,
} from '../services/backupService.js';
import JSZip from 'jszip';

test('getMonthDateRange returns valid UTC start and end bounds', () => {
  const { start, end } = getMonthDateRange('2026-08');
  assert.equal(start.toISOString(), '2026-08-01T00:00:00.000Z');
  assert.equal(end.toISOString(), '2026-08-31T23:59:59.999Z');
});

test('buildQueryForCollection preserves all master data and caps transactions by date', () => {
  const userQuery = buildQueryForCollection({ name: 'users' }, '2026-08');
  assert.deepEqual(userQuery, {});

  const accountQuery = buildQueryForCollection({ name: 'accounts' }, '2026-08');
  assert.deepEqual(accountQuery, {});

  const txQuery = buildQueryForCollection({ name: 'transactions' }, '2026-08');
  assert.ok(txQuery.date);
  assert.ok(txQuery.date.$lte);
});

test('validateBackupZip rejects empty or invalid archives without manifest', async () => {
  const zip = new JSZip();
  zip.file('dummy.txt', 'hello');
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });

  const result = await validateBackupZip(buffer);
  assert.equal(result.isValid, false);
  assert.ok(result.errors.some((e) => e.includes('manifest.json')));
});

test('validateBackupZip successfully validates a correctly constructed backup archive', async () => {
  const zip = new JSZip();
  const folder = zip.folder('backup');

  const manifest = {
    application: 'Pixx Technologies Property Finance & Expense Management System',
    backupType: 'monthly',
    backupMonth: '2026-08',
    backupVersion: '1.0.0',
    schemaVersion: '1.0.0',
    collections: ['users', 'accounts', 'properties'],
    documentCounts: { users: 1, accounts: 1, properties: 1 },
    totalDocuments: 3,
  };

  folder.file('manifest.json', JSON.stringify(manifest));
  folder.file('users.json', EJSON.stringify([{ _id: { $oid: '6aa7f0b80220e9e0c82d9801' }, name: 'Admin', role: 'ADMIN' }]));
  folder.file('accounts.json', EJSON.stringify([{ _id: { $oid: '6aa7f0b80220e9e0c82d9802' }, name: 'UBL Bank', type: 'BANK' }]));
  folder.file('properties.json', EJSON.stringify([{ _id: { $oid: '6aa7f0b80220e9e0c82d9803' }, propertyName: 'Plaza 1' }]));

  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  const result = await validateBackupZip(buffer);

  assert.equal(result.isValid, true);
  assert.equal(result.errors.length, 0);
  assert.equal(result.manifest.backupMonth, '2026-08');
  assert.equal(result.summary.totalDocuments, 3);
});
