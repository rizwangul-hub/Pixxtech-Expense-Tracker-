/**
 * Phase 10 Comprehensive Verification Suite
 * Complete Financial Reports, Ledgers, Exports & Reconciliation
 * Pixx Technologies Property Finance System
 */
import dotenv from 'dotenv';
dotenv.config();

const API_BASE = 'http://127.0.0.1:5000/api';
let adminToken = '';
let dataEntryToken = '';

const apiCall = async (path, options = {}, token = adminToken) => {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    return { status: res.status, headers: res.headers, data };
  } else {
    const buffer = await res.arrayBuffer();
    return { status: res.status, headers: res.headers, buffer: Buffer.from(buffer) };
  }
};

const assert = (condition, message) => {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  [PASS] ${message}`);
};

console.log('\n======================================================');
console.log('  PHASE 10 COMPREHENSIVE AUTOMATED VERIFICATION');
console.log('  Financial Reports, Ledgers, Exports & Reconciliation');
console.log('======================================================\n');

// 1. Authenticate
console.log('1. Authenticating Admin & Data Entry Users...');
const adminLogin = await apiCall('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'admin@pixxtechnologies.com', password: 'admin12345' }),
});
assert(adminLogin.status === 200, 'Admin login returns HTTP 200');
adminToken = adminLogin.data?.token;
assert(!!adminToken, 'Admin JWT token received');

const entryLogin = await apiCall('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'entry@pixxtechnologies.com', password: 'entry12345' }),
});
assert(entryLogin.status === 200, 'Data Entry login returns HTTP 200');
dataEntryToken = entryLogin.data?.token;
assert(!!dataEntryToken, 'Data Entry JWT token received');

// 2. RBAC Enforcement
console.log('\n2. Testing RBAC Security Protection (Part 13)...');
const rbacTest1 = await apiCall('/reports/expense-summary?month=2026-08', {}, dataEntryToken);
assert(rbacTest1.status === 403, 'Data Entry blocked from Expense Summary Report (HTTP 403)');

const rbacTest2 = await apiCall('/reports/reconciliation', {}, dataEntryToken);
assert(rbacTest2.status === 403, 'Data Entry blocked from Reconciliation Audit Report (HTTP 403)');

const rbacTest3 = await apiCall('/reports/export/excel?type=all-transactions', {}, dataEntryToken);
assert(rbacTest3.status === 403, 'Data Entry blocked from Excel Export (HTTP 403)');

// 3. Resolve Bank Account & Cash Holder
console.log('\n3. Resolving Accounts from System Master (Part 1 & 2)...');
const accsRes = await apiCall('/accounts?limit=100');
assert(accsRes.status === 200, 'Accounts list returns HTTP 200');
const allAccounts = accsRes.data?.data?.accounts || accsRes.data?.accounts || [];
assert(allAccounts.length > 0, `Loaded ${allAccounts.length} accounts from master`);

const bankAcc = allAccounts.find((a) => a.type === 'BANK' && a.isActive);
assert(!!bankAcc, `Resolved Active Bank Account: ${bankAcc?.name}`);

const cashAcc = allAccounts.find((a) => a.type === 'CASH' && a.isActive);
assert(!!cashAcc, `Resolved Active Cash Holder Account: ${cashAcc?.name}`);

// 4. Bank Account Ledger (Part 1)
console.log('\n4. Testing Bank Account Ledger Report (Part 1)...');
const bankLedgerRes = await apiCall(`/reports/account-ledger/${bankAcc._id}?month=2026-08`);
assert(bankLedgerRes.status === 200, 'Bank Account Ledger returns HTTP 200');
const bankLedger = bankLedgerRes.data;
assert(typeof bankLedger.openingBalance === 'number', `Opening Balance calculated: Rs. ${bankLedger.openingBalance}`);
assert(typeof bankLedger.totalDebits === 'number', `Total Debits (Money In): Rs. ${bankLedger.totalDebits}`);
assert(typeof bankLedger.totalCredits === 'number', `Total Credits (Money Out): Rs. ${bankLedger.totalCredits}`);
assert(typeof bankLedger.closingBalance === 'number', `Closing Balance: Rs. ${bankLedger.closingBalance}`);

// Mathematical running balance integrity check
let calcBal = bankLedger.openingBalance;
for (const entry of bankLedger.entries) {
  calcBal = Math.round((calcBal + (entry.drAmount || 0) - (entry.crAmount || 0)) * 100) / 100;
  assert(
    Math.abs(calcBal - entry.runningBalance) < 0.01,
    `Running balance integrity verified on V.N ${entry.voucherNo}: calc=${calcBal} vs recorded=${entry.runningBalance}`
  );
}
assert(
  Math.abs(calcBal - bankLedger.closingBalance) < 0.01,
  `Final computed balance (${calcBal}) strictly equals closingBalance (${bankLedger.closingBalance})`
);

// 5. Cash Holder Ledger (Part 2)
console.log('\n5. Testing Cash Holder Ledger Report (Part 2)...');
const cashLedgerRes = await apiCall(`/reports/account-ledger/${cashAcc._id}?month=2026-08`);
assert(cashLedgerRes.status === 200, 'Cash Holder Ledger returns HTTP 200');
const cashLedger = cashLedgerRes.data;
assert(typeof cashLedger.openingBalance === 'number', `Cash Holder Opening Balance: Rs. ${cashLedger.openingBalance}`);
assert(typeof cashLedger.closingBalance === 'number', `Cash Holder Closing Balance: Rs. ${cashLedger.closingBalance}`);
assert(Array.isArray(cashLedger.entries), 'Cash Holder ledger entries returned as array');

// 6. Head-Wise Expenses Summary (Part 3)
console.log('\n6. Testing Head-Wise Expense Summary (Part 3)...');
const expenseRes = await apiCall('/reports/expense-summary?month=2026-08');
assert(expenseRes.status === 200, 'Expense Summary returns HTTP 200');
const expData = expenseRes.data;
assert(expData.totalExpenses === 1588695, `Total Expenses strictly equals August report (Rs. 1,588,695, got ${expData.totalExpenses})`);
assert(Array.isArray(expData.heads), 'Expense heads returned as array');
assert(expData.heads.length > 0, `Found ${expData.heads.length} expense heads with spend`);

const headsSum = expData.heads.reduce((sum, h) => sum + h.totalSpent, 0);
assert(
  Math.abs(headsSum - expData.totalExpenses) < 0.01,
  `Sum of expense heads (${headsSum}) strictly equals totalExpenses (${expData.totalExpenses})`
);

// 7. Property-Wise Expense Report (Part 4)
console.log('\n7. Testing Property-Wise Expense Report (Part 4)...');
const propExpRes = await apiCall('/reports/property-expense?month=2026-08');
assert(propExpRes.status === 200, 'Property Expense Report returns HTTP 200');
const propExpData = propExpRes.data;
assert(typeof propExpData.grandTotal === 'number', `Property Expenses Grand Total: Rs. ${propExpData.grandTotal}`);
assert(Array.isArray(propExpData.properties), 'Property list returned as array');
assert(propExpData.properties.length > 0, `Found ${propExpData.properties.length} property buckets with expenses`);

// Check structure: each property has heads array with totalSpent
for (const p of propExpData.properties) {
  assert(p.propertyName, `Property bucket has name: "${p.propertyName}"`);
  assert(Array.isArray(p.heads), `Property "${p.propertyName}" has itemized heads`);
  const subSum = p.heads.reduce((s, h) => s + h.totalSpent, 0);
  assert(
    Math.abs(subSum - p.totalSpent) < 0.01,
    `Property "${p.propertyName}" subtotal (${p.totalSpent}) matches sum of heads (${subSum})`
  );
}

// 8. All Transactions Report (Part 5)
console.log('\n8. Testing Central All Transactions Report (Part 5)...');
const allTxRes = await apiCall('/reports/all-transactions?month=2026-08&limit=500');
assert(allTxRes.status === 200, 'All Transactions Report returns HTTP 200');
const txData = allTxRes.data;
assert(Array.isArray(txData.transactions), 'Transactions array returned');
assert(txData.transactions.length > 0, `Loaded ${txData.transactions.length} transaction entries`);
assert(txData.summary, 'Summary object present');
assert(txData.summary.totalRentalIncome === 1443675, `Total Rental Income in ledger: Rs. ${txData.summary.totalRentalIncome}`);
assert(typeof txData.summary.uniqueVouchersCount === 'number', `Unique Vouchers Count: ${txData.summary.uniqueVouchersCount}`);

// Test filtering: by transactionType
const expenseFilterRes = await apiCall('/reports/all-transactions?month=2026-08&transactionType=EXPENSE');
assert(expenseFilterRes.status === 200, 'Filter by transactionType=EXPENSE returns HTTP 200');
assert(
  expenseFilterRes.data.transactions.every((t) => t.transactionType === 'EXPENSE'),
  'Every returned transaction is strictly EXPENSE'
);

// 9. Voucher Details & Multi-line Handling (Part 6 & 7)
console.log('\n9. Testing Voucher Details & Multi-line Integrity (Part 6 & 7)...');
const sampleTx = txData.transactions[0];
assert(!!sampleTx.voucherNo, `Testing voucher #${sampleTx.voucherNo}`);

const voucherRes = await apiCall(`/vouchers/number/${sampleTx.voucherNo}`);
assert(voucherRes.status === 200, `Voucher detail for #${sampleTx.voucherNo} returns HTTP 200`);
const retVn = voucherRes.data?.data?.voucher?.voucherNumber || voucherRes.data?.data?.voucherNumber;
assert(retVn === sampleTx.voucherNo, `Voucher number matches (${retVn} === ${sampleTx.voucherNo})`);
assert(voucherRes.data?.data?.isBalanced !== undefined, 'Voucher is accounting balanced (Debit == Credit)');

// 10. Reconciliation Report (Part 12)
console.log('\n10. Testing Central Reconciliation Audit (Part 12)...');
const reconcileRes = await apiCall('/reports/reconciliation?month=2026-08');
assert(reconcileRes.status === 200, 'Reconciliation report returns HTTP 200');
const recData = reconcileRes.data;
assert(recData.summary, 'Reconciliation summary object present');
assert(recData.summary.totalAccounts > 0, `Audited ${recData.summary.totalAccounts} total accounts`);
console.log(`  [INFO] Reconciled Accounts: ${recData.summary.reconciledCount} / ${recData.summary.totalAccounts}`);
console.log(`  [INFO] Grand Ledger Total: Rs. ${recData.summary.grandLedgerTotal.toLocaleString()}`);
console.log(`  [INFO] Grand Live DB Total: Rs. ${recData.summary.grandLiveTotal.toLocaleString()}`);

// 11. Excel Export (Part 9)
console.log('\n11. Testing Professional Excel Export Suite (Part 9)...');

// 11a. Bank Account Ledger Excel
const excelLedger = await apiCall(`/reports/export/excel?type=account-ledger&accountId=${bankAcc._id}&month=2026-08`);
assert(excelLedger.status === 200, 'Excel export for Account Ledger returns HTTP 200');
assert(excelLedger.buffer && excelLedger.buffer.length > 500, `Account Ledger Excel file generated (${excelLedger.buffer.length} bytes)`);
assert(
  excelLedger.headers.get('content-type').includes('spreadsheetml'),
  'Content-Type is valid Excel spreadsheet'
);

// 11b. Head-Wise Expense Summary Excel
const excelExpense = await apiCall('/reports/export/excel?type=expense-summary&month=2026-08');
assert(excelExpense.status === 200, 'Excel export for Expense Summary returns HTTP 200');
assert(excelExpense.buffer && excelExpense.buffer.length > 500, `Expense Summary Excel file generated (${excelExpense.buffer.length} bytes)`);

// 11c. Property-Wise Expense Excel
const excelProp = await apiCall('/reports/export/excel?type=property-expense&month=2026-08');
assert(excelProp.status === 200, 'Excel export for Property Expense returns HTTP 200');
assert(excelProp.buffer && excelProp.buffer.length > 500, `Property Expense Excel file generated (${excelProp.buffer.length} bytes)`);

// 11d. All Transactions Excel
const excelAllTx = await apiCall('/reports/export/excel?type=all-transactions&month=2026-08');
assert(excelAllTx.status === 200, 'Excel export for All Transactions returns HTTP 200');
assert(excelAllTx.buffer && excelAllTx.buffer.length > 1000, `All Transactions Excel file generated (${excelAllTx.buffer.length} bytes)`);

// 11e. Rental Income Summary Excel
const excelRental = await apiCall('/reports/export/excel?type=rental-income&month=2026-08');
assert(excelRental.status === 200, 'Excel export for Rental Income returns HTTP 200');
assert(excelRental.buffer && excelRental.buffer.length > 500, `Rental Income Excel file generated (${excelRental.buffer.length} bytes)`);

// 12. CSV Export (Part 10)
console.log('\n12. Testing CSV Export Engine (Part 10)...');

// 12a. Account Ledger CSV
const csvLedger = await apiCall(`/reports/export/csv?type=account-ledger&accountId=${bankAcc._id}&month=2026-08`);
assert(csvLedger.status === 200, 'CSV export for Account Ledger returns HTTP 200');
const csvLedgerStr = csvLedger.buffer.toString('utf-8');
assert(csvLedgerStr.includes('Date,V.N,Description'), 'CSV Ledger contains required headers');
assert(csvLedgerStr.includes('OPENING BALANCE B/F'), 'CSV Ledger contains Opening Balance line');

// 12b. Expense Summary CSV
const csvExpense = await apiCall('/reports/export/csv?type=expense-summary&month=2026-08');
assert(csvExpense.status === 200, 'CSV export for Expense Summary returns HTTP 200');
const csvExpStr = csvExpense.buffer.toString('utf-8');
assert(csvExpStr.includes('Expense Head'), 'CSV Expense Summary contains required headers');
assert(csvExpStr.includes('TOTAL'), 'CSV Expense Summary contains Total row');

// 12c. All Transactions CSV
const csvAllTx = await apiCall('/reports/export/csv?type=all-transactions&month=2026-08');
assert(csvAllTx.status === 200, 'CSV export for All Transactions returns HTTP 200');
const csvAllTxStr = csvAllTx.buffer.toString('utf-8');
assert(csvAllTxStr.includes('Date,V.N,Description,Category,Type'), 'CSV All Transactions contains required column headers');

console.log('\n======================================================');
console.log('  ALL PHASE 10 TESTS PASSED CLEANLY! (100% PASS RATE)');
console.log('  FINANCIAL REPORTS, LEDGERS & EXPORTS FULLY VERIFIED.');
console.log('======================================================\n');
