import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Account from '../models/Account.js';
import Transaction from '../models/Transaction.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_BASE = 'http://127.0.0.1:5000/api';

async function main() {
  console.log('\n======================================================');
  console.log('  PHASE 4 COMPREHENSIVE AUTOMATED VERIFICATION');
  console.log('  Pixx Technologies Property Finance & Expense System');
  console.log('======================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // 1. Authenticate as ADMIN
  console.log('1. Authenticating as System Administrator...');
  const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@pixxtechnologies.com', password: 'admin12345' }),
  });
  const adminLoginData = await adminLoginRes.json();
  assert(adminLoginRes.status === 200, 'Admin login returns HTTP 200');
  const adminToken = adminLoginData.data?.token || adminLoginData.token;
  assert(Boolean(adminToken), 'Admin token received');

  // 2. Authenticate as DATA_ENTRY
  console.log('\n2. Authenticating as Data Entry operator...');
  const entryLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'entry@pixxtechnologies.com', password: 'entry12345' }),
  });
  const entryLoginData = await entryLoginRes.json();
  assert(entryLoginRes.status === 200, 'Data Entry login returns HTTP 200');
  const entryToken = entryLoginData.data?.token || entryLoginData.token;
  assert(Boolean(entryToken), 'Data Entry token received');

  // 3. Test Monthly Summary Endpoint & Reconciled August-2026 Figures
  console.log('\n3. Verifying August-2026 Liquidity Summary & Audit Figures...');
  const sumRes = await fetch(`${API_BASE}/accounts/monthly-summary?month=2026-08`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const sumData = await sumRes.json();
  assert(sumRes.status === 200, 'Monthly summary returns HTTP 200');
  assert(sumData.success === true, 'Monthly summary success is true');
  const macro = sumData.data?.summary;
  assert(macro !== undefined, 'Macro summary object present in response');

  console.log(`     Total Company Funds : Rs. ${macro.totalCompanyFunds?.toLocaleString()}`);
  console.log(`     Bank Balances Total : Rs. ${macro.bankTotalClosing?.toLocaleString()}`);
  console.log(`     Cash in Hand Total  : Rs. ${macro.cashTotalClosing?.toLocaleString()}`);

  assert(macro.bankTotalClosing === 12273730.28, 'Bank Balances Total matches August Report (Rs. 12,273,730.28)');
  assert(macro.cashTotalClosing === 93314, 'Cash in Hand Total matches August Report (Rs. 93,314.00)');
  assert(macro.totalCompanyFunds === 12367044.28, 'Grand Total Company Funds matches August Report (Rs. 12,367,044.28)');

  // 4. Test Accounts Directory & Search
  console.log('\n4. Verifying Accounts Directory API...');
  const accRes = await fetch(`${API_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const accData = await accRes.json();
  assert(accRes.status === 200, 'Accounts list returns HTTP 200');
  const accountsList = accData.data?.accounts || [];
  assert(accountsList.length >= 10, `Found ${accountsList.length} accounts (expected >= 10)`);

  const majidAcc = accountsList.find((a) => a.name.includes('Majid Javed'));
  assert(Boolean(majidAcc), 'Cash in Hand (Majid Javed) account found in database');
  const ablAcc = accountsList.find((a) => a.name.includes('ABL (Kamran Ijaz Sb)'));
  assert(Boolean(ablAcc), 'ABL (Kamran Ijaz Sb) bank account found in database');

  // 5. Test Account Creation Validation
  console.log('\n5. Testing Account Creation & Validation...');
  const invalidBankRes = await fetch(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      accountName: 'Test Incomplete Bank',
      accountType: 'BANK',
      // Missing bankName
    }),
  });
  assert(invalidBankRes.status === 400, 'Creating Bank without bankName returns HTTP 400');

  const invalidCashRes = await fetch(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      accountName: 'Test Incomplete Cash',
      accountType: 'CASH',
      // Missing cashHolder
    }),
  });
  assert(invalidCashRes.status === 400, 'Creating Cash without cashHolder returns HTTP 400');

  // 6. Test RBAC: Data Entry user cannot create accounts
  console.log('\n6. Testing RBAC Account Creation Restrictions...');
  const rbacAccRes = await fetch(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${entryToken}`,
    },
    body: JSON.stringify({
      accountName: 'Unauthorized Account',
      accountType: 'BANK',
      bankName: 'Test Bank',
    }),
  });
  assert(rbacAccRes.status === 403, 'Data Entry user blocked from creating account (HTTP 403)');

  // 7. Create a Temporary Test Account
  console.log('\n7. Creating Temporary Bank & Cash Accounts for Transfer Invariance testing...');
  const tempTimestamp = Date.now().toString().slice(-4);
  const testBankRes = await fetch(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      accountName: `Phase4 Test Bank ${tempTimestamp}`,
      accountType: 'BANK',
      bankName: 'Meezan Bank Ltd',
      accountNumber: `PK00MEZN${tempTimestamp}`,
      ownerName: 'Pixx Technologies',
      openingBalance: 500000,
      openingBalanceDate: '2026-08-01',
    }),
  });
  const testBankData = await testBankRes.json();
  assert(testBankRes.status === 201, 'Test Bank created successfully (HTTP 201)');
  const testBankId = testBankData.data?._id;

  const testCashRes = await fetch(`${API_BASE}/accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      accountName: `Cash in Hand (Test Custodian ${tempTimestamp})`,
      accountType: 'CASH',
      cashHolder: `Test Custodian ${tempTimestamp}`,
      openingBalance: 100000,
      openingBalanceDate: '2026-08-01',
    }),
  });
  const testCashData = await testCashRes.json();
  assert(testCashRes.status === 201, 'Test Cash account created successfully (HTTP 201)');
  const testCashId = testCashData.data?._id;

  // 8. Test Transfer Validation Constraints
  console.log('\n8. Testing Transfer Validation & Boundary Checks...');
  // Same account transfer
  const sameAccRes = await fetch(`${API_BASE}/transfers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      fromAccountId: testBankId,
      toAccountId: testBankId,
      amount: 10000,
      detail: 'Transfer to self',
    }),
  });
  assert(sameAccRes.status === 400, 'Transfer to identical account blocked (HTTP 400)');

  // Zero / Negative amount transfer
  const zeroAmtRes = await fetch(`${API_BASE}/transfers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      fromAccountId: testBankId,
      toAccountId: testCashId,
      amount: -500,
      detail: 'Negative transfer',
    }),
  });
  assert(zeroAmtRes.status === 400, 'Negative transfer amount blocked (HTTP 400)');

  // 9. Execute Valid Transfer & Verify Transfer Invariance
  console.log('\n9. Executing Atomic Transfer & Verifying Transfer Invariance...');
  const transferAmount = 25000;
  const transferRes = await fetch(`${API_BASE}/transfers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      fromAccountId: testBankId,
      toAccountId: testCashId,
      amount: transferAmount,
      date: '2026-08-10',
      voucherNo: `TRF-TEST-${tempTimestamp}`,
      detail: `Transfer of Rs. ${transferAmount} from Test Bank to Test Cash custodian`,
    }),
  });
  const transferData = await transferRes.json();
  assert(transferRes.status === 201, 'Transfer executed successfully (HTTP 201)');
  assert(transferData.success === true, 'Transfer response success is true');

  const sourceBalAfter = transferData.data?.sourceAccount?.currentBalance;
  const destBalAfter = transferData.data?.destinationAccount?.currentBalance;

  assert(sourceBalAfter === 500000 - transferAmount, `Source Bank balance decreased by ${transferAmount} (500,000 -> ${sourceBalAfter})`);
  assert(destBalAfter === 100000 + transferAmount, `Destination Cash balance increased by ${transferAmount} (100,000 -> ${destBalAfter})`);

  const combinedBefore = 500000 + 100000;
  const combinedAfter = sourceBalAfter + destBalAfter;
  assert(combinedBefore === combinedAfter, `Transfer Invariance Verified: Combined liquidity remained exactly ${combinedBefore} PKR`);

  // 10. Verify Running Balance Calculation in Account Ledger
  console.log('\n10. Verifying Account Ledger Running Balances & Deterministic Ordering...');
  const bankLedgerRes = await fetch(`${API_BASE}/accounts/${testBankId}/ledger?month=2026-08`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const bankLedgerData = await bankLedgerRes.json();
  assert(bankLedgerRes.status === 200, 'Bank ledger retrieved successfully');
  const bankEntries = bankLedgerData.data?.ledgerEntries || [];
  assert(bankEntries.length === 1, 'Bank ledger has exactly 1 entry');
  assert(bankEntries[0].credit === transferAmount, `Bank ledger shows Credit (outflow) of ${transferAmount}`);
  assert(bankEntries[0].balance === 500000 - transferAmount, `Bank ledger running balance shows ${500000 - transferAmount}`);

  const cashLedgerRes = await fetch(`${API_BASE}/accounts/${testCashId}/ledger?month=2026-08`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const cashLedgerData = await cashLedgerRes.json();
  assert(cashLedgerRes.status === 200, 'Cash ledger retrieved successfully');
  const cashEntries = cashLedgerData.data?.ledgerEntries || [];
  assert(cashEntries.length === 1, 'Cash ledger has exactly 1 entry');
  assert(cashEntries[0].debit === transferAmount, `Cash ledger shows Debit (inflow) of ${transferAmount}`);
  assert(cashEntries[0].balance === 100000 + transferAmount, `Cash ledger running balance shows ${100000 + transferAmount}`);

  // 11. Test Soft Deactivation
  console.log('\n11. Testing Non-Destructive Soft Deactivation...');
  const deactRes = await fetch(`${API_BASE}/accounts/${testBankId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const deactData = await deactRes.json();
  assert(deactRes.status === 200, 'Toggle account status returns HTTP 200');
  assert(deactData.data?.isActive === false, 'Account marked isActive = false (soft deactivated)');

  // Attempt transfer from inactive account
  const inactiveTransferRes = await fetch(`${API_BASE}/transfers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      fromAccountId: testBankId,
      toAccountId: testCashId,
      amount: 5000,
      detail: 'Transfer from deactivated account',
    }),
  });
  assert(inactiveTransferRes.status === 400, 'Transfer from deactivated account rejected (HTTP 400)');

  // Reactivate account
  const reactRes = await fetch(`${API_BASE}/accounts/${testBankId}/status`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  assert(reactRes.status === 200, 'Reactivate account returns HTTP 200');

  // Clean up temporary test data
  console.log('\n12. Cleaning up temporary test accounts and transaction...');
  await mongoose.connect(process.env.MONGO_URI);

  await Transaction.deleteMany({ voucherNo: `TRF-TEST-${tempTimestamp}` });
  await Account.deleteMany({ _id: { $in: [testBankId, testCashId] } });
  await mongoose.disconnect();
  console.log('  [PASS] Cleaned up temporary test records from MongoDB Atlas.');
  totalTests++;
  passedTests++;

  console.log('\n======================================================');
  console.log(`  ALL ${passedTests} / ${totalTests} TESTS PASSED CLEANLY!`);
  console.log('  PHASE 4 IMPLEMENTATION FULLY VERIFIED.');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('\n[FATAL TEST FAILURE]:', err.message);
  process.exit(1);
});
