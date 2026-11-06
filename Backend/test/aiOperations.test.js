import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { resolveActionProposal, extractAmount } from '../services/ai/transactionIntentResolver.js';
import { stageAction, getAction, consumeAction, cancelAction, clearStagedActions } from '../services/ai/actionStagingService.js';
import { executeConfirmedAction } from '../services/ai/financialOperationsExecutor.js';
import aiRoutes from '../routes/aiRoutes.js';
import User from '../models/User.js';
import Account from '../models/Account.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import RentalAgreement from '../models/RentalAgreement.js';
import Category from '../models/Category.js';
import Employee from '../models/Employee.js';
import StaffLoan from '../models/StaffLoan.js';
import Transaction from '../models/Transaction.js';
import PendingEntry from '../models/PendingEntry.js';
import RentReceived from '../models/RentReceived.js';
import AuditLog from '../models/AuditLog.js';
import MonthlyReport from '../models/MonthlyReport.js';
import Voucher from '../models/Voucher.js';
import mongoose from 'mongoose';

// Prevent 10-second Mongoose session buffer timeout in tests
mongoose.startSession = async () => {
  throw new Error('No replica set in mock test');
};

const adminUser = {
  _id: '111111111111111111111111',
  name: 'Fahad Rasheed',
  email: 'fahad@pixxtech.com',
  role: 'ADMIN',
  isActive: true,
  lastActiveAt: new Date(),
};

const verifierUser = {
  _id: '222222222222222222222222',
  name: 'Khurshid Anwar',
  email: 'khurshid@pixxtech.com',
  role: 'VERIFIER',
  isActive: true,
  lastActiveAt: new Date(),
};

const dataEntryUser = {
  _id: '333333333333333333333333',
  name: 'Sarfraz Khan',
  email: 'sarfraz@pixxtech.com',
  role: 'DATA_ENTRY',
  isActive: true,
  lastActiveAt: new Date(),
};

const guestUser = {
  _id: '444444444444444444444444',
  name: 'Guest User',
  email: 'guest@pixxtech.com',
  role: 'GUEST',
  isActive: true,
};

const makeDoc = (data) => {
  if (!data) return null;
  return {
    isActive: true,
    openingBalance: 100000,
    currentBalance: 100000,
    ...data,
    save: async function () { return this; },
    toObject: function () { return { ...this }; },
  };
};

const queryChain = (rows) => {
  const resolved = Array.isArray(rows)
    ? rows.map((r) => makeDoc(r))
    : makeDoc(rows);

  const chain = {
    select() { return this; },
    populate() { return this; },
    sort() { return this; },
    limit() { return this; },
    session() { return this; },
    maxTimeMS() { return this; },
    lean: async () => rows,
    save: async function () { return this; },
    then(resolve, reject) {
      return Promise.resolve(resolved).then(resolve, reject);
    },
  };

  if (resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
    Object.assign(chain, resolved);
  }

  return chain;
};

test.beforeEach(() => {
  clearStagedActions();
  process.env.JWT_SECRET = 'test-jwt-secret-phase2';
  process.env.AI_ENABLED = 'true';
  process.env.AI_PROVIDER = 'gemini';
  process.env.AI_MODEL = 'gemini-flash-lite-latest';
  process.env.GEMINI_API_KEY = 'test-key';
});

// 1. Amount Extraction
test('AI Operations - Extract amount from various currency patterns', () => {
  assert.equal(extractAmount('Collect Rs. 25,000 rent from Flat 4'), 25000);
  assert.equal(extractAmount('Receive Rs 50000 rent'), 50000);
  assert.equal(extractAmount('Record 10k petrol expense'), 10000);
  assert.equal(extractAmount('Transfer Rs. 100,000 from UBL'), 100000);
  assert.equal(extractAmount('Transfer Rs. 1 from UBL(Saba Kamran) to ABL (Abida Ijaz)'), 1);
  assert.equal(extractAmount('Rs 1'), 1);
  assert.equal(extractAmount('No amount mentioned in this prompt'), null);
});

// 1b. Proposal Resolution for Internal Transfer with Parentheses in Account Names
test('AI Operations - Resolve internal transfer with parenthesized account names and Rs. 1', async (t) => {
  const accUbl = { _id: '507f191e810c19729de86051', name: 'UBL (Saba Kamran)', type: 'BANK', isActive: true };
  const accAbl = { _id: '507f191e810c19729de86052', name: 'ABL (Abida Ijaz)', type: 'BANK', isActive: true };

  t.mock.method(Account, 'find', () => queryChain([accUbl, accAbl]));
  t.mock.method(Property, 'find', () => queryChain([]));
  t.mock.method(Tenant, 'find', () => queryChain([]));
  t.mock.method(Employee, 'find', () => queryChain([]));
  t.mock.method(Category, 'find', () => queryChain([]));

  const proposal = await resolveActionProposal('Transfer Rs. 1 from UBL(Saba Kamran) to ABL (Abida Ijaz)', adminUser);

  assert.equal(proposal.isProposal, true);
  assert.equal(proposal.actionType, 'CREATE_TRANSFER');
  assert.equal(proposal.summary.amount, 1);
  assert.equal(proposal.payload.fromAccountId, String(accUbl._id));
  assert.equal(proposal.payload.toAccountId, String(accAbl._id));
  assert.match(proposal.confirmationPrompt, /UBL \(Saba Kamran\)/);
  assert.match(proposal.confirmationPrompt, /ABL \(Abida Ijaz\)/);
  assert.match(proposal.confirmationPrompt, /1/);
});

// 2. Proposal Resolution for Rent Collection
test('AI Operations - Resolve rent collection proposal with matched tenant and account', async (t) => {
  const propertyId = 'prop-12345678901234567890';
  const unitId = 'unit-12345678901234567890';
  const tenantId = 'tenant-123456789012345678';
  const ublAccountId = 'acc-ubl-12345678901234567';

  t.mock.method(Account, 'find', () => queryChain([
    { _id: ublAccountId, name: 'UBL Bank Account', type: 'BANK' },
    { _id: 'acc-cash', name: 'Cash in Hand', type: 'CASH' },
  ]));
  t.mock.method(Property, 'find', () => queryChain([
    {
      _id: propertyId,
      plazaName: 'Commercial Plaza',
      units: [{ _id: unitId, unitName: 'Flat 4', unitNumber: 'F-4' }],
    },
  ]));
  t.mock.method(Tenant, 'find', () => queryChain([
    { _id: tenantId, fullName: 'Ahmed Khan' },
  ]));
  t.mock.method(RentalAgreement, 'findOne', () => ({
    populate() { return this; },
    lean: async () => ({
      _id: 'agr-1',
      propertyId: { _id: propertyId, plazaName: 'Commercial Plaza' },
      unitId: { _id: unitId, unitName: 'Flat 4' },
      tenantId: { _id: tenantId, fullName: 'Ahmed Khan' },
    }),
  }));
  t.mock.method(Employee, 'find', () => queryChain([]));
  t.mock.method(Category, 'find', () => queryChain([]));

  const proposal = await resolveActionProposal('Receive Rs. 25,000 rent from Flat 4 in UBL', adminUser);
  assert.ok(proposal?.isProposal);
  assert.equal(proposal.actionType, 'CREATE_RENT');
  assert.equal(proposal.summary.amount, 25000);
  assert.ok(proposal.summary.account.includes('UBL'));
  assert.ok(proposal.summary.property.includes('Flat 4'));
});

// 3. Clarification on Missing Information
test('AI Operations - Returns clarification question when essential entity is missing', async (t) => {
  t.mock.method(Account, 'find', () => queryChain([]));
  t.mock.method(Property, 'find', () => queryChain([{ _id: 'p1', plazaName: 'Bahria Town' }]));
  t.mock.method(Tenant, 'find', () => queryChain([]));
  t.mock.method(Employee, 'find', () => queryChain([]));
  t.mock.method(Category, 'find', () => queryChain([]));

  const res = await resolveActionProposal('Record Rs. 25,000 rent', adminUser);
  assert.ok(res?.isClarification);
  assert.ok(res.message.includes('specify which property, unit, or tenant'));
});

// 4. Action Staging & Idempotency
test('AI Operations - Action staging, retrieval, consumption, and idempotency', () => {
  const proposalPayload = {
    userId: adminUser._id,
    actionType: 'CREATE_EXPENSE',
    summary: { type: 'Expense Voucher', amount: 5000 },
    payload: { amount: 5000, categoryId: 'cat-1' },
  };

  const staged = stageAction(proposalPayload);
  assert.ok(staged.actionId.startsWith('act_'));

  const retrieved = getAction(staged.actionId, adminUser._id);
  assert.ok(retrieved);
  assert.equal(retrieved.actionType, 'CREATE_EXPENSE');

  // Consume action
  const consumed = consumeAction(staged.actionId, adminUser._id);
  assert.equal(consumed.actionId, staged.actionId);

  // Second consumption fails (idempotent; cannot execute twice)
  const secondConsume = consumeAction(staged.actionId, adminUser._id);
  assert.equal(secondConsume, null);
});

// 5. Execution: Rent Collection for DATA_ENTRY (Creates PendingEntry)
test('AI Operations - Data entry user creates temporary PendingEntry for rent', async (t) => {
  t.mock.method(PendingEntry, 'create', async (doc) => ({
    _id: 'pending-rent-1',
    ...doc,
  }));
  t.mock.method(AuditLog, 'create', async () => ({ _id: 'audit-1' }));

  const action = {
    actionType: 'CREATE_RENT',
    payload: {
      amount: 25000,
      rentMonth: '2026-11',
      receivingAccountId: 'acc-1',
      tenantId: 'tenant-1',
      propertyId: 'prop-1',
    },
  };

  const result = await executeConfirmedAction(action, dataEntryUser);
  assert.equal(result.success, true);
  assert.equal(result.isPending, true);
  assert.ok(result.voucherNo.startsWith('PENDING-'));
  assert.ok(result.message.includes('temporary pending entry awaiting verification'));
});

// 6. Execution: Rent Collection for VERIFIER (Posts Direct Transaction)
test('AI Operations - Verifier user creates verified Transaction and RentReceived', async (t) => {
  const accUblId = '507f191e810c19729de86001';
  const tenantId = '507f191e810c19729de86002';
  const propId = '507f191e810c19729de86003';
  const catRentId = '507f191e810c19729de86004';
  const clearingId = '507f191e810c19729de86005';

  t.mock.method(Category, 'findOne', () => queryChain({ _id: catRentId, name: 'Rental Income', type: 'INCOME', isRentalHead: true }));
  t.mock.method(Category, 'findById', () => queryChain({ _id: catRentId, name: 'Rental Income', type: 'INCOME', isRentalHead: true }));
  t.mock.method(Account, 'findOne', () => queryChain({ _id: clearingId, name: 'Rental Clearing', isActive: true }));
  t.mock.method(Account, 'findById', () => queryChain({ _id: accUblId, name: 'UBL Bank', isActive: true, openingBalance: 100000, currentBalance: 100000 }));
  t.mock.method(Account, 'findByIdAndUpdate', async () => ({}));
  t.mock.method(Account, 'updateOne', async () => ({}));
  t.mock.method(Voucher, 'findOne', () => queryChain(null));
  t.mock.method(Voucher, 'create', async (arr) => arr.map((item, idx) => ({ _id: `vchr-${idx}`, ...item })));
  t.mock.method(MonthlyReport, 'findOne', () => queryChain(null));
  t.mock.method(RentReceived, 'findOne', () => queryChain({ receiptNumber: 'RR-2026-00010' }));
  t.mock.method(RentReceived, 'create', async (doc) => ({ _id: 'rr-1', ...doc }));
  t.mock.method(Transaction, 'create', async (arr) => Array.isArray(arr) ? arr.map((a, i) => ({ _id: `tx-${i}`, ...a })) : { _id: 'tx-1', ...arr });
  t.mock.method(Transaction, 'find', () => queryChain([]));
  t.mock.method(AuditLog, 'create', async () => ({ _id: 'audit-1' }));

  const action = {
    actionType: 'CREATE_RENT',
    payload: {
      amount: 35000,
      rentMonth: '2026-11',
      receivingAccountId: accUblId,
      tenantId: tenantId,
      propertyId: propId,
    },
  };

  const result = await executeConfirmedAction(action, verifierUser);
  assert.equal(result.success, true);
  assert.equal(result.isPending, false);
  assert.equal(result.voucherNo, 'RR-2026-00011');
  assert.ok(result.message.includes('recorded successfully'));
});

// 7. Execution: Internal Funds Transfer
test('AI Operations - Internal funds transfer executes double-entry transfer', async (t) => {
  const accUblId = '507f191e810c19729de86011';
  const accAlfalahId = '507f191e810c19729de86012';
  const catTrfId = '507f191e810c19729de86013';

  t.mock.method(Category, 'findOne', () => queryChain({ _id: catTrfId, name: 'Transfer', type: 'TRANSFER' }));
  t.mock.method(Category, 'findById', () => queryChain({ _id: catTrfId, name: 'Transfer', type: 'TRANSFER' }));
  t.mock.method(MonthlyReport, 'findOne', () => queryChain(null));
  t.mock.method(Voucher, 'findOne', () => queryChain(null));
  t.mock.method(Voucher, 'create', async (arr) => arr.map((item, idx) => ({ _id: `vchr-${idx}`, ...item })));
  t.mock.method(Transaction, 'create', async (arr) => Array.isArray(arr) ? arr.map((a, i) => ({ _id: `tx-${i}`, ...a })) : { _id: 'tx-trf-1', ...arr });
  t.mock.method(Transaction, 'find', () => queryChain([]));
  t.mock.method(Account, 'findById', (id) => queryChain({ _id: id || accUblId, name: 'Bank', isActive: true, openingBalance: 50000, currentBalance: 50000 }));
  t.mock.method(Account, 'findByIdAndUpdate', async () => ({}));
  t.mock.method(Account, 'updateOne', async () => ({}));
  t.mock.method(AuditLog, 'create', async () => ({ _id: 'audit-1' }));

  const action = {
    actionType: 'CREATE_TRANSFER',
    payload: {
      fromAccountId: accUblId,
      toAccountId: accAlfalahId,
      amount: 40000,
      detail: 'Transfer UBL to Alfalah',
    },
  };

  const result = await executeConfirmedAction(action, adminUser);
  assert.equal(result.success, true);
  assert.equal(result.actionType, 'CREATE_TRANSFER');
  assert.ok(result.voucherNo.startsWith('TRF-'));
});

// 8. Execution: Employee Loan Disbursement and Repayment
test('AI Operations - Employee loan disbursement updates balance and creates StaffLoan', async (t) => {
  const empDoc = {
    _id: 'emp-1',
    name: 'Sabir Nawaz',
    loanBalance: 10000,
    save: async function () { return this; },
  };

  t.mock.method(Employee, 'findById', async () => empDoc);
  t.mock.method(StaffLoan, 'create', async (doc) => ({ _id: 'loan-1', ...doc }));
  t.mock.method(AuditLog, 'create', async () => ({ _id: 'audit-1' }));

  const disburseAction = {
    actionType: 'CREATE_LOAN_DISBURSEMENT',
    payload: {
      employeeId: 'emp-1',
      type: 'DISBURSEMENT',
      amount: 15000,
      description: 'Advance loan',
    },
  };

  const disburseRes = await executeConfirmedAction(disburseAction, adminUser);
  assert.equal(disburseRes.success, true);
  assert.equal(empDoc.loanBalance, 25000);
  assert.ok(disburseRes.message.includes('25,000'));

  // Test Repayment
  const repayAction = {
    actionType: 'CREATE_LOAN_REPAYMENT',
    payload: {
      employeeId: 'emp-1',
      type: 'REPAYMENT',
      amount: 5000,
    },
  };

  const repayRes = await executeConfirmedAction(repayAction, adminUser);
  assert.equal(repayRes.success, true);
  assert.equal(empDoc.loanBalance, 20000);
  assert.ok(repayRes.message.includes('20,000'));
});

// 9. Execution: Transaction Deletion / Reversal
test('AI Operations - Delete voucher removes record and recalculates balances', async (t) => {
  const txId = '507f191e810c19729de86021';
  const accDrId = '507f191e810c19729de86022';
  const accCrId = '507f191e810c19729de86023';

  t.mock.method(Transaction, 'findById', async () => ({
    _id: txId,
    voucherNo: 'EXP-101',
    amount: 5000,
    date: new Date(),
    drAccountId: accDrId,
    crAccountId: accCrId,
  }));
  t.mock.method(MonthlyReport, 'findOne', () => queryChain(null)); // Not locked
  t.mock.method(Transaction, 'findByIdAndDelete', async () => ({}));
  t.mock.method(Transaction, 'find', () => queryChain([]));
  t.mock.method(Account, 'findById', (id) => queryChain({ _id: id || accCrId, name: 'Account', isActive: true, openingBalance: 10000, currentBalance: 10000 }));
  t.mock.method(Account, 'updateOne', async () => ({}));
  t.mock.method(AuditLog, 'create', async () => ({ _id: 'audit-1' }));

  const action = {
    actionType: 'DELETE_TRANSACTION',
    payload: {
      transactionId: txId,
      voucherNo: 'EXP-101',
    },
  };

  const result = await executeConfirmedAction(action, adminUser);
  assert.equal(result.success, true);
  assert.ok(result.message.includes('deleted'));
});

// 10. Security: Reject Unauthorized Access
test('AI Operations - Rejects operations for guest users without ENTER_DATA permission', async () => {
  const action = {
    actionType: 'CREATE_EXPENSE',
    payload: { amount: 5000 },
  };

  await assert.rejects(
    executeConfirmedAction(action, guestUser),
    (err) => err.status === 403 && err.message.includes('permission')
  );
});

// 11. Full HTTP Flow: Stage proposal via /api/ai/chat and confirm via /api/ai/confirm-action
test('AI Operations - Full HTTP flow: Staged proposal returned, then confirmed via /confirm-action', async (t) => {
  process.env.AI_ENABLED = 'true';
  process.env.AI_PROVIDER = 'gemini';
  process.env.AI_MODEL = 'gemini-flash-lite-latest';
  process.env.GEMINI_API_KEY = 'test-key';
  const token = jwt.sign({ id: adminUser._id }, 'test-jwt-secret-phase2');
  const catElecId = '507f191e810c19729de86031';
  const accCashId = '507f191e810c19729de86032';
  const accClearingId = '507f191e810c19729de86033';

  t.mock.method(User, 'findById', () => queryChain(adminUser));

  t.mock.method(Account, 'find', () => queryChain([
    { _id: accCashId, name: 'Cash in Hand', type: 'CASH' },
  ]));
  t.mock.method(Property, 'find', () => queryChain([]));
  t.mock.method(Tenant, 'find', () => queryChain([]));
  t.mock.method(Employee, 'find', () => queryChain([]));
  t.mock.method(Category, 'find', () => queryChain([
    { _id: catElecId, name: 'Electricity', type: 'EXPENSE', isActive: true, expenseClassification: 'GENERAL_EXPENSE' },
  ]));
  t.mock.method(Transaction, 'findOne', () => queryChain(null));
  t.mock.method(MonthlyReport, 'findOne', () => queryChain(null));

  // Step 1: Prompt AI to record expense
  const req1 = {
    headers: { authorization: `Bearer ${token}` },
    body: { message: 'Record Rs. 5,000 electricity expense under Electricity' },
    user: adminUser,
  };

  let stagedActionId = null;
  const res1 = {
    status(code) { this.statusCode = code; return this; },
    json(data) {
      assert.equal(data.success, true);
      assert.ok(data.pendingAction);
      assert.equal(data.pendingAction.actionType, 'CREATE_EXPENSE');
      stagedActionId = data.pendingAction.actionId;
      return this;
    },
  };

  const { handleFinanceChat, handleConfirmAction } = await import('../controllers/aiAssistantController.js');
  await handleFinanceChat(req1, res1);

  assert.ok(stagedActionId);

  // Step 2: Confirm action via /confirm-action
  t.mock.method(Category, 'findOne', () => queryChain({ _id: catElecId, name: 'Electricity', type: 'EXPENSE', isActive: true, expenseClassification: 'GENERAL_EXPENSE' }));
  t.mock.method(Category, 'findById', () => queryChain({ _id: catElecId, name: 'Electricity', type: 'EXPENSE', isActive: true, expenseClassification: 'GENERAL_EXPENSE' }));
  t.mock.method(Account, 'findOne', () => queryChain({ _id: accClearingId, name: 'Clearing Account', isActive: true }));
  t.mock.method(Account, 'findById', (id) => queryChain({ _id: id || accCashId, name: 'Account', isActive: true, openingBalance: 10000, currentBalance: 10000 }));
  t.mock.method(Account, 'findByIdAndUpdate', async () => ({}));
  t.mock.method(Account, 'updateOne', async () => ({}));
  t.mock.method(Voucher, 'findOne', () => queryChain(null));
  t.mock.method(Voucher, 'create', async (arr) => arr.map((item, idx) => ({ _id: `vchr-${idx}`, ...item })));
  t.mock.method(Transaction, 'create', async (arr) => Array.isArray(arr) ? arr.map((a, i) => ({ _id: `tx-${i}`, ...a })) : { _id: 'tx-elec-1', voucherNo: 'EXP-999', ...arr });
  t.mock.method(Transaction, 'find', () => queryChain([]));
  t.mock.method(AuditLog, 'create', async () => ({ _id: 'audit-1' }));

  const req2 = {
    headers: { authorization: `Bearer ${token}` },
    body: { actionId: stagedActionId },
    user: adminUser,
  };

  const res2 = {
    status(code) { this.statusCode = code; return this; },
    json(data) {
      assert.equal(data.success, true);
      assert.equal(data.actionType, 'CREATE_EXPENSE');
      assert.ok(data.message.includes('recorded successfully'));
      return this;
    },
  };

  await handleConfirmAction(req2, res2);
});
