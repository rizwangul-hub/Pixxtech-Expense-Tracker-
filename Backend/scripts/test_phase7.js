import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Account from '../models/Account.js';
import Transaction from '../models/Transaction.js';
import Voucher from '../models/Voucher.js';
import Category from '../models/Category.js';
import Property from '../models/Property.js';
import RentReceived from '../models/RentReceived.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_BASE = 'http://127.0.0.1:5000/api';

async function main() {
  console.log('\n======================================================');
  console.log('  PHASE 7 COMPREHENSIVE AUTOMATED VERIFICATION');
  console.log('  Pixx Technologies Central Transaction Ledger & Vouchers');
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

  // 1. Authentication (Admin & Data Entry)
  console.log('1. Authenticating Users...');
  const adminLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@pixxtechnologies.com', password: 'admin12345' }),
  });
  const entryLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'entry@pixxtechnologies.com', password: 'entry12345' }),
  });

  const adminLogin = await adminLoginRes.json();
  const entryLogin = await entryLoginRes.json();
  assert(adminLoginRes.status === 200, 'Admin login returns HTTP 200');
  assert(entryLoginRes.status === 200, 'Data Entry login returns HTTP 200');

  const adminToken = adminLogin.token || adminLogin.data?.token;
  const entryToken = entryLogin.token || entryLogin.data?.token;
  assert(Boolean(adminToken), 'Admin token received');
  assert(Boolean(entryToken), 'Data Entry token received');

  // Connect Mongoose to query directly
  await mongoose.connect(process.env.MONGO_URI);

  // 2. Synchronize Legacy Transactions to Vouchers
  console.log('\n2. Testing Legacy Synchronization to Voucher Headers...');
  const syncRes = await fetch(`${API_BASE}/vouchers/sync-legacy`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const syncData = await syncRes.json();
  assert(syncRes.status === 200, 'Sync legacy vouchers returns HTTP 200');
  assert(syncData.success === true, 'Sync legacy returns success = true');

  // 3. Voucher Number Suggestion
  console.log('\n3. Testing Sequential Voucher Number Suggestion...');
  const suggestRes = await fetch(`${API_BASE}/vouchers/suggest-vn`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const suggestData = await suggestRes.json();
  assert(suggestRes.status === 200, 'Suggest VN returns HTTP 200');
  const suggestedVn = suggestData.data?.suggestedVoucherNo;
  assert(Boolean(suggestedVn) && !isNaN(Number(suggestedVn)), `Sequential numeric voucher number suggested: ${suggestedVn}`);

  // 4. Resolve Active Master Accounts & Categories for Testing
  console.log('\n4. Resolving Active Accounts & Categories for Double-Entry...');
  const [bankAcc, cashAcc, clearingAcc, expenseCat, transferCat] = await Promise.all([
    Account.findOne({ type: 'BANK', isActive: true }),
    Account.findOne({ type: 'CASH', isClearing: { $ne: true }, isActive: true }),
    Account.findOne({ isClearing: true }),
    Category.findOne({ type: 'EXPENSE' }),
    Category.findOne({ type: 'TRANSFER' }),
  ]);

  assert(Boolean(bankAcc), `Active Bank account found: ${bankAcc?.name}`);
  assert(Boolean(cashAcc), `Active Cash custodian found: ${cashAcc?.name}`);
  assert(Boolean(clearingAcc), `Operations Clearing account found: ${clearingAcc?.name}`);
  assert(Boolean(expenseCat), `Expense Category found: ${expenseCat?.name}`);
  assert(Boolean(transferCat), `Transfer Category found: ${transferCat?.name}`);

  // 5. Test Double-Entry Balancing & Validation on Voucher Creation
  console.log('\n5. Testing Double-Entry Validation (Balanced vs Unbalanced)...');
  const unbalancedPayload = {
    voucherNumber: `TEST-UNBAL-${Date.now()}`,
    voucherDate: '2026-08-31',
    voucherType: 'EXPENSE',
    lines: [
      {
        detail: 'Invalid missing fields',
        amount: 5000,
        // missing accounts and category
      },
    ],
  };
  const unbalRes = await fetch(`${API_BASE}/vouchers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${entryToken}` },
    body: JSON.stringify(unbalancedPayload),
  });
  assert(unbalRes.status === 400, 'Unbalanced or incomplete voucher rejected with HTTP 400');

  // 6. Test Multi-Line Voucher Creation (e.g. Voucher 3066 pattern)
  console.log('\n6. Testing Multi-Line Voucher Creation (Voucher 3066 Pattern)...');
  const testVn = `VN-TEST-${Date.now().toString().slice(-4)}`;
  const cashBalBefore = (await Account.findById(cashAcc._id)).currentBalance || 0;

  const multiLinePayload = {
    voucherNumber: testVn,
    voucherDate: '2026-08-31',
    voucherType: 'EXPENSE',
    reference: 'CHQ-98124',
    description: 'Monthly operational multi-line expense voucher',
    checkedBy: 'Fahad Sb',
    lines: [
      {
        detail: 'Office stationery and printing paper',
        categoryId: expenseCat._id,
        drAccountId: clearingAcc._id,
        crAccountId: cashAcc._id,
        amount: 3500,
      },
      {
        detail: 'Fuel expense for field inspection',
        categoryId: expenseCat._id,
        drAccountId: clearingAcc._id,
        crAccountId: cashAcc._id,
        amount: 2500,
      },
      {
        detail: 'Office refreshments and tea',
        categoryId: expenseCat._id,
        drAccountId: clearingAcc._id,
        crAccountId: cashAcc._id,
        amount: 1500,
      },
    ],
  };

  const createVoucherRes = await fetch(`${API_BASE}/vouchers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${entryToken}` },
    body: JSON.stringify(multiLinePayload),
  });
  const createVoucherData = await createVoucherRes.json();
  assert(createVoucherRes.status === 201, 'Multi-line voucher created successfully (HTTP 201)');
  assert(createVoucherData.data?.voucher?.linesCount === 3, 'Voucher linesCount is exactly 3');
  assert(createVoucherData.data?.voucher?.totalAmount === 7500, 'Total voucher amount is Rs. 7,500 (3500 + 2500 + 1500)');
  assert(createVoucherData.data?.transactions?.length === 3, 'Created 3 transaction lines in the central ledger');

  // Verify Cash Account Credited (outflow of 7,500)
  const cashBalAfter = (await Account.findById(cashAcc._id)).currentBalance || 0;
  assert(cashBalAfter === cashBalBefore - 7500, `Cash Custodian balance correctly decreased by Rs. 7,500 (${cashBalBefore} -> ${cashBalAfter})`);

  // 7. Test Fetching Voucher by ID and Number
  console.log('\n7. Testing Voucher Lookup by ID & Number...');
  const [byIdRes, byNumRes] = await Promise.all([
    fetch(`${API_BASE}/vouchers/${createVoucherData.data.voucher._id}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }),
    fetch(`${API_BASE}/vouchers/number/${testVn}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    }),
  ]);

  const byIdData = await byIdRes.json();
  const byNumData = await byNumRes.json();
  assert(byIdRes.status === 200, 'Voucher lookup by ID returns HTTP 200');
  assert(byNumRes.status === 200, 'Voucher lookup by Number returns HTTP 200');
  assert(byIdData.data?.lines?.length === 3, 'Voucher by ID contains all 3 itemized lines');
  assert(byIdData.data?.isBalanced === true, 'Voucher isBalanced confirmation is true');
  assert(byIdData.data?.totalDebit === 7500 && byIdData.data?.totalCredit === 7500, 'Total Debit equals Total Credit (Rs. 7,500)');

  // 8. Test Central All Transactions Query & Multi-Filters
  console.log('\n8. Testing All Transactions Central Ledger Query...');
  const txQueryRes = await fetch(`${API_BASE}/vouchers/transactions?month=2026-08`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const txQueryData = await txQueryRes.json();
  assert(txQueryRes.status === 200, 'All Transactions query returns HTTP 200');
  assert(txQueryData.data?.transactions?.length > 0, 'Transactions array returned with items');
  assert(txQueryData.data?.pagination?.total > 0, 'Pagination total count verified');

  // Verify 8 columns in response
  const firstTx = txQueryData.data.transactions[0];
  assert(Boolean(firstTx.date), 'Column 1: Date is present');
  assert(Boolean(firstTx.voucherNo), 'Column 2: V.N is present');
  assert(Boolean(firstTx.detail), 'Column 3: Transaction Detail is present');
  assert(Boolean(firstTx.categoryId), 'Column 4: Account Head is present');
  assert(Boolean(firstTx.reportCategory), 'Column 5: Category is present');
  assert(Boolean(firstTx.drAccountId), 'Column 6: Account (Dr.) is present');
  assert(Boolean(firstTx.crAccountId), 'Column 7: Account (Cr.) is present');
  assert(firstTx.amount > 0, 'Column 8: Amount is present and positive');

  // 9. Test Filter by Voucher Number & Search
  console.log('\n9. Testing Voucher Number Search in Central Ledger...');
  const searchVnRes = await fetch(`${API_BASE}/vouchers/transactions?voucherNo=${testVn}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const searchVnData = await searchVnRes.json();
  assert(searchVnData.data?.transactions?.length === 3, `Filtering by voucherNo '${testVn}' returns all 3 lines`);
  assert(searchVnData.data?.summary?.filteredLineTotal === 7500, 'Filtered line total is exactly Rs. 7,500');
  assert(searchVnData.data?.summary?.filteredVoucherTotal === 7500, 'Filtered voucher total is exactly Rs. 7,500');
  assert(searchVnData.data?.summary?.uniqueVouchersCount === 1, 'Unique vouchers count is exactly 1');

  // 10. Test Transfer Segregation (Transfers do not pollute Income or Expense)
  console.log('\n10. Testing Transfer Segregation in Central Ledger...');
  const transferQueryRes = await fetch(`${API_BASE}/vouchers/transactions?month=2026-08&reportCategory=Transfer`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const transferQueryData = await transferQueryRes.json();
  assert(transferQueryRes.status === 200, 'Transfer category query returns HTTP 200');
  assert(transferQueryData.data?.summary?.totalRentalIncome === 0, 'Transfers contribute 0 to Rental Income');
  assert(transferQueryData.data?.summary?.totalRentalExpenses === 0, 'Transfers contribute 0 to Rental Expenses');
  assert(transferQueryData.data?.summary?.totalTransfers > 0, 'Transfers tracked distinctly in totalTransfers');

  // 11. Test Reversal Safety on Voucher
  console.log('\n11. Testing Reversal Safety on Voucher...');
  const reverseRes = await fetch(`${API_BASE}/vouchers/${createVoucherData.data.voucher._id}/reverse`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ reason: 'Audit test reversal' }),
  });
  const reverseData = await reverseRes.json();
  assert(reverseRes.status === 200, 'Reversal endpoint returns HTTP 200');
  assert(reverseData.data?.voucher?.status === 'REVERSED', 'Voucher marked as REVERSED');
  assert(reverseData.data?.reversedLinesCount === 3, 'All 3 lines marked as reversed');

  // Verify Cash balance restored after reversal
  const cashBalAfterRev = (await Account.findById(cashAcc._id)).currentBalance || 0;
  assert(cashBalAfterRev === cashBalBefore, `Cash Custodian balance fully restored to ${cashBalBefore} (${cashBalAfter} -> ${cashBalAfterRev})`);

  // Verify reversed voucher excluded from active totals by default
  const afterRevQueryRes = await fetch(`${API_BASE}/vouchers/transactions?voucherNo=${testVn}`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const afterRevQueryData = await afterRevQueryRes.json();
  assert(afterRevQueryData.data?.transactions?.length === 0, 'Reversed voucher lines excluded from default active ledger query');

  // 12. Test RBAC: DATA_ENTRY cannot reverse vouchers
  console.log('\n12. Testing RBAC Permission Enforcement...');
  const entryReverseRes = await fetch(`${API_BASE}/vouchers/${createVoucherData.data.voucher._id}/reverse`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${entryToken}` },
    body: JSON.stringify({ reason: 'Unauthorized reversal attempt' }),
  });
  assert(entryReverseRes.status === 403, 'Data Entry user blocked from reversing voucher (HTTP 403)');

  // 13. Cleanup Temporary Test Records
  console.log('\n13. Cleaning up temporary Phase 7 test records...');
  await Transaction.deleteMany({ voucherNo: testVn });
  await Voucher.deleteOne({ voucherNumber: testVn });
  console.log('  [PASS] Cleaned up temporary test records from MongoDB Atlas.');
  totalTests++;
  passedTests++;

  await mongoose.disconnect();

  console.log('\n======================================================');
  console.log(`  ALL ${passedTests} / ${totalTests} TESTS PASSED CLEANLY!`);
  console.log('  PHASE 7 IMPLEMENTATION FULLY VERIFIED.');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('\n[FATAL TEST FAILURE]:', err);
  process.exit(1);
});
