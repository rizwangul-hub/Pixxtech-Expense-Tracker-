import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLiveAccountBalances } from '../services/accountBalance.js';

test('live account balances include opening balance and active debit/credit movements', () => {
  const accounts = [
    { _id: 'bank-1', openingBalance: 1000 },
    { _id: 'cash-1', openingBalance: 500 },
  ];
  const transactions = [
    { drAccountId: 'bank-1', crAccountId: 'income', amount: 250 },
    { drAccountId: 'expense', crAccountId: 'bank-1', amount: 75 },
    { drAccountId: 'cash-1', crAccountId: 'income', amount: 20 },
  ];

  assert.deepEqual(
    calculateLiveAccountBalances(accounts, transactions),
    new Map([
      ['bank-1', 1175],
      ['cash-1', 520],
    ])
  );
});

test('live account balances ignore reversed and void transactions', () => {
  const accounts = [{ _id: 'bank-1', openingBalance: 1000 }];
  const transactions = [
    { drAccountId: 'bank-1', crAccountId: 'income', amount: 250, status: 'REVERSED' },
    { drAccountId: 'expense', crAccountId: 'bank-1', amount: 75, status: 'VOID' },
    { drAccountId: 'bank-1', crAccountId: 'income', amount: 10, status: 'POSTED' },
  ];

  assert.equal(calculateLiveAccountBalances(accounts, transactions).get('bank-1'), 1010);
});
