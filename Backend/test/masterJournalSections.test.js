import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMasterJournalSections,
  resolveMasterJournalCategory,
} from '../services/pdfReportService.js';

test('master journal classifies transactions and groups them in report order', () => {
  const vouchers = [
    { category: resolveMasterJournalCategory({ transactionType: 'INCOME', reportCategory: 'Other Income' }), amount: 300 },
    { category: resolveMasterJournalCategory({ transactionType: 'INCOME', reportCategory: 'Rent' }), amount: 400 },
    { category: resolveMasterJournalCategory({ transactionType: 'EXPENSE' }), amount: 100 },
    { category: resolveMasterJournalCategory({ transactionType: 'TRANSFER' }), amount: 50 },
  ];

  const sections = buildMasterJournalSections(vouchers);

  assert.deepEqual(sections.map((section) => section.category), [
    'Payments',
    'Rent',
    'Other Income',
    'Transfer',
  ]);
  assert.deepEqual(sections.map((section) => section.vouchers.length), [1, 1, 1, 1]);
  assert.ok(sections.every((section) => !Object.hasOwn(section, 'totalAmount')));
  assert.equal(resolveMasterJournalCategory({ sourceModule: 'OWNER_PERSONAL' }), 'Payments');
  assert.equal(resolveMasterJournalCategory({ sourceModule: 'RENT_RECEIVED' }), 'Rent');
});
