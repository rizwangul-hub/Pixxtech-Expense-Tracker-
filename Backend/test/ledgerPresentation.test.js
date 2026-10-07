import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBankStatementHeading,
  getLiquidityLedgerAmounts,
  getLiquidityStatementAmounts,
} from '../services/ledgerPresentation.js';

const bankAccountId = 'bank-account';

test('liquidity ledger presents expenses and salary payments as debit/out', () => {
  const amounts = getLiquidityLedgerAmounts({
    drAccountId: 'salary-expense',
    crAccountId: bankAccountId,
    amount: 12500,
  }, bankAccountId);

  assert.deepEqual(amounts, {
    debit: 12500,
    credit: 0,
    balanceChange: -12500,
  });
});

test('liquidity ledger presents rent and other income as credit/in', () => {
  const amounts = getLiquidityLedgerAmounts({
    drAccountId: bankAccountId,
    crAccountId: 'income-clearing',
    amount: 8400,
  }, bankAccountId);

  assert.deepEqual(amounts, {
    debit: 0,
    credit: 8400,
    balanceChange: 8400,
  });
});

test('liquidity ledger preserves normal account balance movement on transfers', () => {
  const outgoing = getLiquidityLedgerAmounts({
    drAccountId: 'cash-account',
    crAccountId: bankAccountId,
    amount: 2500,
  }, bankAccountId);
  const incoming = getLiquidityLedgerAmounts({
    drAccountId: bankAccountId,
    crAccountId: 'cash-account',
    amount: 2500,
  }, bankAccountId);

  assert.equal(outgoing.debit, 2500);
  assert.equal(outgoing.credit, 0);
  assert.equal(outgoing.balanceChange, -2500);
  assert.equal(incoming.debit, 0);
  assert.equal(incoming.credit, 2500);
  assert.equal(incoming.balanceChange, 2500);
});

test('monthly bank and cash statements show expenses as debit/out', () => {
  assert.deepEqual(getLiquidityStatementAmounts({
    drAmount: 0,
    crAmount: 12500,
    counterpartyAccount: 'Salary Expense',
  }, 'Cash in Hand'), {
    debit: 12500,
    credit: 0,
    debitAccount: 'Salary Expense',
    creditAccount: 'Cash in Hand',
  });
});

test('monthly bank and cash statements show rent and other income as credit/in', () => {
  assert.deepEqual(getLiquidityStatementAmounts({
    drAmount: 8400,
    crAmount: 0,
    counterpartyAccount: 'Rental Income',
  }, 'Cash in Hand'), {
    debit: 0,
    credit: 8400,
    debitAccount: 'Cash in Hand',
    creditAccount: 'Rental Income',
  });
});

test('monthly bank statement headings use the holder named in each account', () => {
  assert.deepEqual(getBankStatementHeading('UBL (Saba Kamran)', 'BANK'), {
    title: 'UBL',
    subtitle: 'Saba Kamran',
  });
  assert.deepEqual(getBankStatementHeading('ABL (Abida Ijaz)', 'BANK'), {
    title: 'Allied Bank',
    subtitle: 'Abida Ijaz',
  });
});

test('monthly bank statement headings preserve existing Uraan and Kamran labels', () => {
  assert.deepEqual(getBankStatementHeading('UBL (Uraan Ventures)', 'BANK'), {
    title: 'UBL',
    subtitle: 'Uraan Ventures',
  });
  assert.deepEqual(getBankStatementHeading('ABL (Kamran Ijaz Sb)', 'BANK'), {
    title: 'Allied Bank',
    subtitle: 'Kamran Ijaz Sb',
  });
});
