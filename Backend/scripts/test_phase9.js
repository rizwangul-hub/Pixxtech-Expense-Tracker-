/**
 * Phase 9 Verification — Monthly Financial Summary & Rental Income Summary
 * Tests: GET /api/reports/monthly-financial-summary
 */
import dotenv from 'dotenv';
dotenv.config();

const API_BASE = 'http://127.0.0.1:5000/api';
let adminToken = '';

const apiCall = async (path, options = {}, token = adminToken) => {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
};

const assert = (condition, message) => {
  if (!condition) {
    console.error(`  [FAIL] ${message}`);
    process.exit(1);
  }
  console.log(`  [PASS] ${message}`);
};

console.log('\n======================================================');
console.log('  PHASE 9 VERIFICATION — Monthly Financial Summary');
console.log('  Pixx Technologies Property Finance System');
console.log('======================================================\n');

// 1. Auth
console.log('1. Authenticating as Admin...');
const loginRes = await apiCall('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'admin@pixxtechnologies.com', password: 'admin12345' }),
});
assert(loginRes.status === 200, 'Admin login HTTP 200');
adminToken = loginRes.data?.token;
assert(!!adminToken, 'Admin token received');

// 2. Fetch Monthly Financial Summary for August 2026
console.log('\n2. Fetching Monthly Financial Summary for August 2026...');
const summaryRes = await apiCall('/reports/monthly-financial-summary?month=2026-08');
assert(summaryRes.status === 200, 'Monthly Financial Summary returns HTTP 200');
assert(summaryRes.data?.success === true, 'Response success: true');
assert(summaryRes.data?.period === '2026-08', 'Period matches 2026-08');

const d = summaryRes.data;

// 3. Account Matrix
console.log('\n3. Verifying Account Opening/Closing Balance Matrix...');
assert(d.accountMatrix, 'accountMatrix section exists');
assert(Array.isArray(d.accountMatrix.accounts), 'accounts array present');
assert(d.accountMatrix.accounts.length > 0, `At least 1 account in matrix (found ${d.accountMatrix.accounts.length})`);

const firstAcc = d.accountMatrix.accounts[0];
assert('openingBalance' in firstAcc, 'Account has openingBalance');
assert('totalInput' in firstAcc, 'Account has totalInput');
assert('totalOutput' in firstAcc, 'Account has totalOutput');
assert('closingBalance' in firstAcc, 'Account has closingBalance');
assert(['BANK', 'CASH'].includes(firstAcc.accountType), 'Account type is BANK or CASH');

assert(typeof d.accountMatrix.grandTotal === 'object', 'grandTotal object present');
assert(typeof d.accountMatrix.totalBankBalance === 'number', 'totalBankBalance is a number');
assert(typeof d.accountMatrix.totalCashBalance === 'number', 'totalCashBalance is a number');
assert(typeof d.accountMatrix.grandClosingBalance === 'number', 'grandClosingBalance is a number');

const sumCheck = Math.round((d.accountMatrix.totalBankBalance + d.accountMatrix.totalCashBalance) * 100) / 100;
assert(
  Math.abs(sumCheck - d.accountMatrix.grandClosingBalance) < 0.01,
  `grandClosingBalance = bankBalance + cashBalance (${d.accountMatrix.grandClosingBalance})`
);

// 4. Rental Income Summary
console.log('\n4. Verifying Rental Income Summary by Property Hierarchy...');
assert(d.rentalIncomeSummary, 'rentalIncomeSummary section exists');
assert(typeof d.rentalIncomeSummary.grandTotalAgreed === 'number', 'grandTotalAgreed is a number');
assert(typeof d.rentalIncomeSummary.grandTotalReceived === 'number', 'grandTotalReceived is a number');
assert(typeof d.rentalIncomeSummary.grandTotalOutstanding === 'number', 'grandTotalOutstanding is a number');
assert(typeof d.rentalIncomeSummary.collectionRate === 'number', 'collectionRate is a number');
assert(Array.isArray(d.rentalIncomeSummary.properties), 'properties array present');

// August seeded data: rental income = 1,443,675
assert(
  d.rentalIncomeSummary.grandTotalReceived === 1443675,
  `grandTotalReceived = Rs. 1,443,675 (got ${d.rentalIncomeSummary.grandTotalReceived})`
);
assert(d.rentalIncomeSummary.collectionRate >= 0 && d.rentalIncomeSummary.collectionRate <= 100, 'collectionRate in 0-100 range');

// Check property hierarchy: each property has plazaName and units array
if (d.rentalIncomeSummary.properties.length > 0) {
  const firstPlaza = d.rentalIncomeSummary.properties[0];
  assert(firstPlaza.plazaName, 'First property has plazaName');
  assert(Array.isArray(firstPlaza.units), 'First property has units array');
  assert(typeof firstPlaza.collectionRate === 'number', 'Property has collectionRate');
  console.log(`  [INFO] ${d.rentalIncomeSummary.properties.length} properties in hierarchy`);
}

// 5. Other Income Summary
console.log('\n5. Verifying Other Income Summary...');
assert(d.otherIncomeSummary, 'otherIncomeSummary section exists');
assert(typeof d.otherIncomeSummary.totalOtherIncome === 'number', 'totalOtherIncome is a number');
assert(Array.isArray(d.otherIncomeSummary.breakdown), 'breakdown array present');
assert(typeof d.otherIncomeSummary.transactionCount === 'number', 'transactionCount is a number');
// August seeded data includes other income transactions
assert(d.otherIncomeSummary.totalOtherIncome >= 0, 'totalOtherIncome is non-negative');

// 6. Expense Summary
console.log('\n6. Verifying Expense Summary by Head...');
assert(d.expenseSummary, 'expenseSummary section exists');
assert(typeof d.expenseSummary.totalExpenses === 'number', 'totalExpenses is a number');
assert(Array.isArray(d.expenseSummary.heads), 'expense heads array present');

// August seeded data: expenses = 1,588,695
assert(
  d.expenseSummary.totalExpenses === 1588695,
  `totalExpenses = Rs. 1,588,695 (got ${d.expenseSummary.totalExpenses})`
);

// 7. Financial Position (Grand Totals)
console.log('\n7. Verifying Grand Financial Position...');
assert(d.financialPosition, 'financialPosition section exists');
assert(
  typeof d.financialPosition.totalRentalIncome === 'number',
  'financialPosition.totalRentalIncome is number'
);
assert(
  typeof d.financialPosition.totalOtherIncome === 'number',
  'financialPosition.totalOtherIncome is number'
);
assert(
  typeof d.financialPosition.totalIncome === 'number',
  'financialPosition.totalIncome is number'
);
assert(
  typeof d.financialPosition.totalExpenses === 'number',
  'financialPosition.totalExpenses is number'
);
assert(
  typeof d.financialPosition.netSurplusDeficit === 'number',
  'financialPosition.netSurplusDeficit is number'
);

// Verify: totalIncome = rentalIncome + otherIncome
const expectedTotal = Math.round((d.financialPosition.totalRentalIncome + d.financialPosition.totalOtherIncome) * 100) / 100;
assert(
  Math.abs(expectedTotal - d.financialPosition.totalIncome) < 0.01,
  `totalIncome = rentalIncome (${d.financialPosition.totalRentalIncome}) + otherIncome (${d.financialPosition.totalOtherIncome}) = ${d.financialPosition.totalIncome}`
);

// Verify: netSurplusDeficit = totalIncome - totalExpenses
const expectedNet = Math.round((d.financialPosition.totalIncome - d.financialPosition.totalExpenses) * 100) / 100;
assert(
  Math.abs(expectedNet - d.financialPosition.netSurplusDeficit) < 0.01,
  `netSurplusDeficit = totalIncome - totalExpenses = ${d.financialPosition.netSurplusDeficit}`
);

// 8. Access Control — Data Entry user should be blocked
console.log('\n8. Verifying RBAC — Data Entry blocked...');
const entryLogin = await apiCall('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'entry@pixxtechnologies.com', password: 'entry12345' }),
});
assert(entryLogin.status === 200, 'Data Entry login HTTP 200');
const entryToken = entryLogin.data?.token;

const entryRes = await apiCall('/reports/monthly-financial-summary?month=2026-08', {}, entryToken);
assert(entryRes.status === 403, 'Data Entry blocked from Financial Summary (HTTP 403)');

// 9. Default month (no params) works
console.log('\n9. Verifying Default Month (no params)...');
const defaultRes = await apiCall('/reports/monthly-financial-summary');
assert(defaultRes.status === 200, 'Summary without month param returns HTTP 200');
assert(defaultRes.data?.period, 'Period field returned for default month');
assert(defaultRes.data?.success === true, 'success: true for default month');

// 10. Print final figures
console.log('\n10. August 2026 Financial Summary:');
console.log(`  Period: ${d.period}`);
console.log(`  Rental Income Received: Rs. ${d.financialPosition.totalRentalIncome.toLocaleString()}`);
console.log(`  Other Income: Rs. ${d.financialPosition.totalOtherIncome.toLocaleString()}`);
console.log(`  Total Income: Rs. ${d.financialPosition.totalIncome.toLocaleString()}`);
console.log(`  Total Expenses: Rs. ${d.financialPosition.totalExpenses.toLocaleString()}`);
console.log(`  Net Surplus/(Deficit): Rs. ${d.financialPosition.netSurplusDeficit.toLocaleString()}`);
console.log(`  Grand Closing Balance: Rs. ${d.financialPosition.grandClosingBalance.toLocaleString()}`);
console.log(`  Properties in Hierarchy: ${d.rentalIncomeSummary.properties.length}`);
console.log(`  Expense Heads: ${d.expenseSummary.heads.length}`);

console.log('\n======================================================');
console.log('  ALL PHASE 9 TESTS PASSED! (100% PASS RATE)');
console.log('  MONTHLY FINANCIAL SUMMARY FULLY VERIFIED.');
console.log('======================================================\n');
