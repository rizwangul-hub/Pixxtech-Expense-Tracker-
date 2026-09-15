import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_BASE = 'http://127.0.0.1:5000/api';

let adminToken = '';
let dataEntryToken = '';
let createdHeadId = '';
let bankAccountId = '';
let cashAccountId = '';
let propertyId = '';
let createdOtherIncomeId1 = '';
let createdOtherIncomeId2 = '';
let createdDraftId = '';

const pass = (msg) => console.log(`  [PASS] ${msg}`);
const fail = (msg, detail) => {
  console.error(`  [FAIL] ${msg}`, detail || '');
  process.exit(1);
};

const assert = (condition, msg, detail) => {
  if (condition) pass(msg);
  else fail(msg, detail);
};

async function apiCall(endpoint, options = {}, token = adminToken) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

async function runPhase8Verification() {
  console.log('======================================================');
  console.log('  PHASE 8 COMPREHENSIVE AUTOMATED VERIFICATION');
  console.log('  Pixx Technologies Other Income & Other Receipts');
  console.log('======================================================\n');

  // 1. Authentication
  console.log('1. Authenticating Users...');
  const adminLogin = await apiCall('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@pixxtechnologies.com', password: 'admin12345' }),
  }, '');
  assert(adminLogin.status === 200, 'Admin login returns HTTP 200');
  adminToken = adminLogin.data?.token;
  assert(!!adminToken, 'Admin token received');

  const entryLogin = await apiCall('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'entry@pixxtechnologies.com', password: 'entry12345' }),
  }, '');
  assert(entryLogin.status === 200, 'Data Entry login returns HTTP 200');
  dataEntryToken = entryLogin.data?.token;
  assert(!!dataEntryToken, 'Data Entry token received');

  // 2. Resolve Active Accounts & Properties
  console.log('\n2. Resolving Active Accounts & Property for Test Pipeline...');
  const accRes = await apiCall('/accounts?limit=20');
  assert(accRes.status === 200, 'Accounts list returns HTTP 200');
  const accounts = accRes.data?.data?.accounts || accRes.data?.accounts || accRes.data?.data || [];
  const bankAcc = accounts.find((a) => a.type === 'BANK' && a.isActive && !a.isClearing);
  const cashAcc = accounts.find((a) => a.type === 'CASH' && a.isActive && !a.isClearing);
  assert(!!bankAcc, `Active Bank account resolved: ${bankAcc?.name}`);
  assert(!!cashAcc, `Active Cash account resolved: ${cashAcc?.name}`);
  bankAccountId = bankAcc._id;
  cashAccountId = cashAcc._id;

  const propRes = await apiCall('/properties?limit=5');
  assert(propRes.status === 200, 'Properties list returns HTTP 200');
  const props = propRes.data?.data?.properties || propRes.data?.properties || propRes.data?.data || [];
  assert(props.length > 0, 'At least one property exists in database');
  propertyId = props[0]._id;

  // 3. Other Income Head Management & RBAC
  console.log('\n3. Testing Other Income Head System & RBAC...');
  const dataEntryHeadTry = await apiCall(
    '/other-income/heads',
    {
      method: 'POST',
      body: JSON.stringify({ name: 'Unauthorized Head Attempt', code: 'UNAUTH' }),
    },
    dataEntryToken
  );
  assert(dataEntryHeadTry.status === 403, 'Data Entry user blocked from creating Income Head (HTTP 403)');

  const testHeadName = `Test Recovery Head ${Date.now()}`;
  const createHeadRes = await apiCall('/other-income/heads', {
    method: 'POST',
    body: JSON.stringify({
      name: testHeadName,
      code: 'TEST-REC',
      description: 'Automated test recovery head',
      isActive: true,
    }),
  });
  assert(createHeadRes.status === 201, 'Admin creates Other Income Head successfully (HTTP 201)');
  createdHeadId = createHeadRes.data?.data?._id;
  assert(!!createdHeadId, 'Created Head ID returned');

  // Duplicate head name prevention
  const dupHeadRes = await apiCall('/other-income/heads', {
    method: 'POST',
    body: JSON.stringify({ name: testHeadName }),
  });
  assert(dupHeadRes.status === 409, 'Duplicate Income Head name rejected with HTTP 409');

  const headsListRes = await apiCall('/other-income/heads');
  assert(headsListRes.status === 200, 'Get heads returns HTTP 200');
  assert(
    headsListRes.data?.data?.some((h) => h._id === createdHeadId),
    'Newly created head is listed in active heads'
  );

  // 4. Record Other Income into Bank Account (Dr Bank, Cr Clearing)
  console.log('\n4. Recording Other Income into Bank Account (Rs. 45,000)...');
  const initialBankBalance = Number(bankAcc.currentBalance);

  const bankIncomePayload = {
    receiptDate: '2026-08-14',
    incomeHeadId: createdHeadId,
    amount: 45000,
    receivingAccountId: bankAccountId,
    propertyId: propertyId,
    receivedFrom: 'Apex Contracting Ltd',
    referenceNumber: 'CHQ-882109',
    transactionDetail: 'Surplus recovery from renovation contractor for 289-Q Plaza',
    description: 'Verified settlement cheque deposited in bank',
    status: 'POSTED',
  };

  const bankIncomeRes = await apiCall('/other-income', {
    method: 'POST',
    body: JSON.stringify(bankIncomePayload),
  });

  assert(bankIncomeRes.status === 201, 'Record other income into Bank returns HTTP 201');
  createdOtherIncomeId1 = bankIncomeRes.data?.data?._id;
  assert(!!createdOtherIncomeId1, 'Other income record created with ID');
  assert(bankIncomeRes.data?.data?.category === 'Other Income', 'Category is strictly "Other Income"');
  assert(bankIncomeRes.data?.data?.amount === 45000, 'Amount is exactly Rs. 45,000');
  assert(!!bankIncomeRes.data?.data?.voucherId, 'Central voucher header was created and linked');
  assert(!!bankIncomeRes.data?.data?.transactionId, 'Central transaction ledger record linked');

  // Helper to extract account balance
  const getBal = (res) => res.data?.data?.account?.currentBalance ?? res.data?.account?.currentBalance;

  // Verify Bank Account Balance Increase
  const bankAccAfter = await apiCall(`/accounts/${bankAccountId}`);
  const expectedBankBalance = Math.round((initialBankBalance + 45000) * 100) / 100;
  assert(
    getBal(bankAccAfter) === expectedBankBalance,
    `Bank balance correctly increased by Rs. 45,000 (${initialBankBalance} -> ${expectedBankBalance})`
  );

  // 5. Record Other Income into Cash Account (Rs. 15,000 General Company Receipt)
  console.log('\n5. Recording Other Income into Cash Account (Rs. 15,000 General Inflow)...');
  const initialCashBalance = Number(cashAcc.currentBalance);

  const cashIncomePayload = {
    receiptDate: '2026-08-18',
    incomeHeadId: createdHeadId,
    amount: 15000,
    receivingAccountId: cashAccountId,
    propertyId: null, // General Company (no property)
    receivedFrom: 'Old Furniture Purchaser',
    referenceNumber: 'CASH-REC-101',
    transactionDetail: 'Sale proceeds of retired office desks and chairs',
    description: 'Cash handed over to custodian',
    status: 'POSTED',
  };

  const cashIncomeRes = await apiCall(
    '/other-income',
    {
      method: 'POST',
      body: JSON.stringify(cashIncomePayload),
    },
    dataEntryToken
  );

  assert(cashIncomeRes.status === 201, 'Data Entry user records cash other income successfully (HTTP 201)');
  createdOtherIncomeId2 = cashIncomeRes.data?.data?._id;
  assert(!!createdOtherIncomeId2, 'Cash other income ID returned');

  // Verify Cash Custodian Balance Increase
  const cashAccAfter = await apiCall(`/accounts/${cashAccountId}`);
  const expectedCashBalance = Math.round((initialCashBalance + 15000) * 100) / 100;
  assert(
    getBal(cashAccAfter) === expectedCashBalance,
    `Cash custodian balance correctly increased by Rs. 15,000 (${initialCashBalance} -> ${expectedCashBalance})`
  );

  // 6. Double-Entry Voucher & Central Ledger Verification
  console.log('\n6. Verifying Central Voucher & Double-Entry Ledger Integrity...');
  const detailRes = await apiCall(`/other-income/${createdOtherIncomeId1}`);
  assert(detailRes.status === 200, 'Get Other Income detail returns HTTP 200');
  const oiDetail = detailRes.data?.data;
  assert(oiDetail.voucherId?.isBalanced === true, 'Voucher isBalanced is true');
  assert(oiDetail.voucherId?.totalDebit === 45000, 'Voucher Total Debit equals Rs. 45,000');
  assert(oiDetail.voucherId?.totalCredit === 45000, 'Voucher Total Credit equals Rs. 45,000');
  assert(oiDetail.voucherId?.voucherType === 'OTHER_INCOME', 'Voucher Type is strictly OTHER_INCOME');
  assert(oiDetail.accountingEntry?.drAccount === bankAcc.name, `Debit Account is ${bankAcc.name}`);
  assert(!!oiDetail.accountingEntry?.crAccount, `Credit Account is populated (${oiDetail.accountingEntry?.crAccount})`);

  // Verify presence in Phase 7 Central Ledger
  const ledgerRes = await apiCall(`/vouchers/transactions?voucherNo=${oiDetail.voucherNo}`);
  assert(ledgerRes.status === 200, 'Central ledger search returns HTTP 200');
  const txList = ledgerRes.data?.data?.transactions || [];
  assert(txList.length === 1, 'Transaction found in 8-column Central Ledger');
  const ledgerTx = txList[0];
  assert(ledgerTx.reportCategory === 'Other Income' || ledgerTx.category === 'Other Income', 'Central Ledger Category column is "Other Income"');
  assert(ledgerTx.amount === 45000, 'Central Ledger Amount column is Rs. 45,000');

  // 7. Duplicate Submission Protection
  console.log('\n7. Testing Backend Duplicate Submission Protection (Double-click lock)...');
  const duplicateRes = await apiCall('/other-income', {
    method: 'POST',
    body: JSON.stringify(bankIncomePayload),
  });
  assert(
    duplicateRes.status === 409,
    'Immediate identical submission blocked with HTTP 409 Conflict'
  );

  // 8. DRAFT Status Behavior
  console.log('\n8. Testing DRAFT Other Income Behavior...');
  const draftRes = await apiCall('/other-income', {
    method: 'POST',
    body: JSON.stringify({
      receiptDate: '2026-08-20',
      incomeHeadId: createdHeadId,
      amount: 99000,
      receivingAccountId: bankAccountId,
      transactionDetail: 'Pending board approval recovery receipt',
      status: 'DRAFT',
    }),
  });
  assert(draftRes.status === 201, 'Draft Other Income created with HTTP 201');
  createdDraftId = draftRes.data?.data?._id;
  assert(draftRes.data?.data?.status === 'DRAFT', 'Status is DRAFT');
  assert(!draftRes.data?.data?.voucherId, 'Draft does NOT create a posted voucher');

  // Verify Bank Balance was NOT affected by draft
  const bankAccDraftCheck = await apiCall(`/accounts/${bankAccountId}`);
  assert(
    getBal(bankAccDraftCheck) === expectedBankBalance,
    'Draft does NOT increase bank balance (remains unchanged)'
  );

  // 9. Monthly Summary & Total Income Calculation (Section 11 & 12)
  console.log('\n9. Testing Monthly Summary & Total Income Foundation (Rental + Other)...');
  const summaryRes = await apiCall('/other-income/monthly-summary?month=2026-08');
  assert(summaryRes.status === 200, 'Monthly Summary returns HTTP 200');
  const sumData = summaryRes.data?.data;
  assert(sumData.totalOtherIncome >= 60000, `Total Other Income reflects posted records (Rs. ${sumData.totalOtherIncome})`);
  assert(sumData.totalRentalIncome === 1443675, `Total Rental Income strictly equals August Report (Rs. ${sumData.totalRentalIncome})`);
  assert(
    sumData.totalIncome === sumData.totalRentalIncome + sumData.totalOtherIncome,
    `Total Income = Rental (${sumData.totalRentalIncome}) + Other (${sumData.totalOtherIncome}) = Rs. ${sumData.totalIncome}`
  );
  assert(sumData.propertyLinkedTotal >= 45000, 'Property-linked other income tracked');
  assert(sumData.generalIncomeTotal >= 15000, 'General company other income tracked');

  // 10. Filters Testing
  console.log('\n10. Testing Filter Capabilities...');
  const filterHeadRes = await apiCall(`/other-income?incomeHeadId=${createdHeadId}`);
  assert(filterHeadRes.status === 200, 'Filter by incomeHeadId returns HTTP 200');
  assert(filterHeadRes.data?.data?.length >= 2, 'Filtered results match created records');

  const filterPropRes = await apiCall(`/other-income?propertyId=${propertyId}`);
  assert(filterPropRes.status === 200, 'Filter by propertyId returns HTTP 200');
  assert(
    filterPropRes.data?.data?.every((r) => r.propertyId?._id === propertyId || r.propertyId === propertyId),
    'Property filter strictly isolates property-linked records'
  );

  const filterGenRes = await apiCall('/other-income?propertyId=none');
  assert(filterGenRes.status === 200, 'Filter general company records returns HTTP 200');
  assert(
    filterGenRes.data?.data?.every((r) => !r.propertyId),
    'General filter strictly isolates records without property'
  );

  // 11. Reversal Safety & Balance Restoration
  console.log('\n11. Testing Non-Destructive Reversal Safety & Balance Restoration...');
  // Data Entry blocked from reversing
  const entryRevTry = await apiCall(
    `/other-income/${createdOtherIncomeId1}/reverse`,
    { method: 'POST', body: JSON.stringify({ reason: 'Unauthorized reversal attempt' }) },
    dataEntryToken
  );
  assert(entryRevTry.status === 403, 'Data Entry user blocked from reversing Other Income (HTTP 403)');

  // Admin executes reversal
  const adminRevRes = await apiCall(`/other-income/${createdOtherIncomeId1}/reverse`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Disputed contractor calculation — reversed for audit' }),
  });
  assert(adminRevRes.status === 200, 'Admin reversal returns HTTP 200');
  assert(adminRevRes.data?.data?.status === 'REVERSED', 'Receipt status marked REVERSED');

  // Verify Bank Balance Restored
  const bankAccRestored = await apiCall(`/accounts/${bankAccountId}`);
  assert(
    getBal(bankAccRestored) === initialBankBalance,
    `Bank balance fully restored to initial balance (${initialBankBalance}) after reversal`
  );

  // Verify reversed record excluded from default active list
  const defaultListRes = await apiCall('/other-income?month=2026-08');
  assert(
    !defaultListRes.data?.data?.some((r) => r._id === createdOtherIncomeId1),
    'Reversed Other Income excluded from default active list'
  );

  // 12. Cleanup Temporary Test Records
  console.log('\n12. Cleaning up temporary Phase 8 test records...');
  const mongooseUri = process.env.MONGO_URI;
  if (mongooseUri) {
    await mongoose.connect(mongooseUri);
    const { OtherIncome } = await import('../models/OtherIncome.js');
    const { OtherIncomeHead } = await import('../models/OtherIncomeHead.js');
    const { Voucher } = await import('../models/Voucher.js');
    const { Transaction } = await import('../models/Transaction.js');
    const { Account } = await import('../models/Account.js');

    // Restore cash account balance for record 2
    await Account.findByIdAndUpdate(cashAccountId, {
      $inc: { currentBalance: -15000 },
    });

    const testOIs = await OtherIncome.find({
      _id: { $in: [createdOtherIncomeId1, createdOtherIncomeId2, createdDraftId] },
    });

    for (const oi of testOIs) {
      if (oi.voucherId) await Voucher.findByIdAndDelete(oi.voucherId);
      if (oi.transactionId) await Transaction.findByIdAndDelete(oi.transactionId);
      await OtherIncome.findByIdAndDelete(oi._id);
    }

    if (createdHeadId) {
      await OtherIncomeHead.findByIdAndDelete(createdHeadId);
    }

    await mongoose.disconnect();
    pass('Cleaned up temporary test records cleanly from MongoDB Atlas.');
  }

  console.log('\n======================================================');
  console.log('  ALL PHASE 8 TESTS PASSED CLEANLY! (100% PASS RATE)');
  console.log('  OTHER INCOME & TOTAL REVENUE FULLY VERIFIED.');
  console.log('======================================================\n');
}

runPhase8Verification().catch((err) => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
