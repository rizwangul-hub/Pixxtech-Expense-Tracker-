import test from 'node:test';
import assert from 'node:assert/strict';
import Employee from '../models/Employee.js';
import Attendance from '../models/Attendance.js';
import Transaction from '../models/Transaction.js';
import Voucher from '../models/Voucher.js';
import Category from '../models/Category.js';
import {
  ALL_FINANCIAL_TOOL_DECLARATIONS,
  FINANCIAL_TOOL_DECLARATIONS,
  executeFinancialTool,
  validateToolArguments,
} from '../services/ai/financialTools.js';
import { nameScore, selectEntity } from '../services/ai/businessDirectory.js';
import { readConversation, signConversation, inheritPlan, explicitAction } from '../services/ai/conversationContext.js';

const viewer = { _id: '123456789012345678901234', role: 'DATA_ENTRY', isActive: true };

const queryChain = rows => {
  const chain = {
    select() { return chain; },
    sort() { return chain; },
    limit() { return chain; },
    skip() { return chain; },
    populate() { return chain; },
    maxTimeMS() { return chain; },
    lean: async () => rows,
  };
  return chain;
};

test('business catalog is unique, read-only, and retains the legacy catalog', () => {
  assert.equal(FINANCIAL_TOOL_DECLARATIONS.length, 13);
  assert.equal(ALL_FINANCIAL_TOOL_DECLARATIONS.length, 27);
  assert.equal(new Set(ALL_FINANCIAL_TOOL_DECLARATIONS.map(tool => tool.name)).size, 27);
  for (const tool of ALL_FINANCIAL_TOOL_DECLARATIONS) {
    assert.equal(tool.parameters.type, 'OBJECT');
    assert.ok(tool.description);
  }
  assert.throws(() => validateToolArguments('getFinancialLedger', {}), /Missing required kind/);
  assert.throws(() => validateToolArguments('getFinancialLedger', { kind: 'ACCOUNT', accountId: 'not-an-id' }), /identifier/);
  assert.throws(() => validateToolArguments('searchBusinessData', { page: 0 }), /out of range/);
});

test('directory matching tolerates names but refuses ambiguous matches', () => {
  assert.ok(nameScore('bank al-falah', 'Bank Al-Falah (Kamran Ijaz Sb)') >= 0.95);
  const exact = selectEntity([
    { _id: 'a', name: 'Rizwan Ullah' },
    { _id: 'b', name: 'Sabir Nawaz' },
  ], 'employee', 'Rizwan Ullah');
  assert.equal(exact.record.name, 'Rizwan Ullah');
  const ambiguous = selectEntity([
    { _id: 'a', name: 'Ali Khan' },
    { _id: 'b', name: 'Ali Raza' },
  ], 'employee', 'Ali');
  assert.equal(ambiguous.kind, 'AMBIGUOUS');
  assert.equal(ambiguous.matches.length, 2);
});

test('employee profile uses recorded fields and omits private identifiers', async t => {
  t.mock.method(Employee, 'find', () => queryChain([{
    _id: '123456789012345678901235',
    name: 'Rizwan Ullah',
    employeeCode: 'EMP-01',
    designation: 'Developer',
    department: 'IT',
    employmentStatus: 'ACTIVE',
    basicSalary: 100000,
    allowance: 12500,
    cnic: 'PRIVATE-CNIC',
    mobileNumber: 'PRIVATE-PHONE',
  }]));

  const result = await executeFinancialTool('getEmployeeProfile', { employeeName: 'Rizwan Ullah' }, viewer);
  assert.equal(result.employee.name, 'Rizwan Ullah');
  assert.equal(result.employee.basicSalary, 100000);
  assert.equal(result.employee.configuredGrossSalary, 112500);
  assert.equal(result.employee.cnic, undefined);
  assert.equal(result.report.pagination.total, 9);
});

test('attendance report uses recorded attendance and does not infer missing days', async t => {
  const employeeId = '123456789012345678901235';
  t.mock.method(Employee, 'find', () => queryChain([{
    _id: employeeId,
    name: 'Rizwan Ullah',
    employmentStatus: 'ACTIVE',
    allowedMonthlyLeaves: 2,
  }]));
  t.mock.method(Attendance, 'find', () => queryChain([
    { _id: 'a1', employeeId, dateStr: '2026-10-01', status: 'PRESENT', arrivalTime: '09:00', shiftOpeningTime: '09:00', lateMinutes: 0 },
    { _id: 'a2', employeeId, dateStr: '2026-10-02', status: 'LATE', arrivalTime: '09:20', shiftOpeningTime: '09:00', lateMinutes: 20 },
  ]));

  const result = await executeFinancialTool('getAttendanceReport', { month: 10, year: 2026, view: 'SUMMARY' }, viewer);
  assert.equal(result.report.summary.recordedAttendance, 2);
  assert.equal(result.report.summary.absentDays, 0);
  assert.equal(result.report.rows[0].recordedDays, 2);
  assert.match(result.report.warnings[0], /not recorded/);
});

test('transaction search uses detail, real statuses, and excludes reversed/void rows', async t => {
  let observedQuery;
  t.mock.method(Transaction, 'find', query => {
    observedQuery = query;
    return queryChain([{
      _id: '123456789012345678901236',
      date: new Date('2026-10-10T10:00:00Z'),
      voucherNo: 'VN-100',
      detail: 'Electricity bill',
      amount: 2500,
      transactionType: 'EXPENSE',
      status: 'POSTED',
    }]);
  });

  const result = await executeFinancialTool('searchTransactions', { query: 'Electricity', month: 10, year: 2026 }, viewer);
  assert.ok(observedQuery.$nor);
  assert.equal(result.report.rows[0].description, 'Electricity bill');
  assert.equal(result.report.rows[0].status, 'POSTED');
  assert.equal(result.report.summary.totalMatchedAmount, 2500);
});

test('voucher lookup preserves explicit status and linked rows', async t => {
  t.mock.method(Voucher, 'findOne', () => queryChain({
    _id: '123456789012345678901237',
    voucherNumber: 'VN-200',
    voucherDate: new Date('2026-10-11T10:00:00Z'),
    voucherType: 'EXPENSE',
    status: 'VOID',
    totalAmount: 500,
    totalDebit: 500,
    totalCredit: 500,
    isBalanced: true,
    linesCount: 1,
  }));
  t.mock.method(Transaction, 'find', () => queryChain([{
    _id: '123456789012345678901238',
    date: new Date('2026-10-11T10:00:00Z'),
    voucherNo: 'VN-200',
    detail: 'Voided expense',
    amount: 500,
    transactionType: 'EXPENSE',
    status: 'VOID',
  }]));

  const result = await executeFinancialTool('getVoucherDetails', { voucherNo: 'VN-200' }, viewer);
  assert.equal(result.report.summary.status, 'VOID');
  assert.equal(result.report.rows[0].description, 'Voided expense');
});

test('signed conversation context is user-bound and preserves only read-only plans', t => {
  const previous = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-context-secret';
  t.after(() => {
    if (previous === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previous;
  });
  const state = { conversationId: 'conversation-1', plans: [{ name: 'getFinancialLedger', args: { kind: 'ACCOUNT', accountId: '123456789012345678901234', month: 10, year: 2026 } }], entities: { accountId: '123456789012345678901234' } };
  const token = signConversation(viewer, state.conversationId, state.plans, state.entities);
  const read = readConversation({ conversationId: state.conversationId, contextToken: token }, viewer);
  assert.equal(read.plans[0].name, 'getFinancialLedger');
  assert.throws(() => readConversation({ conversationId: state.conversationId, contextToken: token }, { ...viewer, _id: '123456789012345678901235' }), /invalid|belongs/i);
  const inherited = inheritPlan({ name: 'getFinancialLedger', args: { kind: 'ACCOUNT', month: 11, year: 2026 } }, read, ALL_FINANCIAL_TOOL_DECLARATIONS, 'What about November?');
  assert.equal(inherited.args.accountId, state.entities.accountId);
  assert.equal(inherited.args.month, 11);
  const next = explicitAction({ type: 'page', page: 2 }, read, ALL_FINANCIAL_TOOL_DECLARATIONS);
  assert.equal(next[0].args.page, 2);
  assert.equal(next[0].args.accountId, state.entities.accountId);
  const boundedToken = signConversation(viewer, 'conversation-2', [], {}, Array.from({ length: 100 }, (_, index) => ({ entityType: 'transaction', id: '123456789012345678901234', name: `Record ${index}`, description: 'not stored'.repeat(1000) })));
  assert.ok(boundedToken.length < 12000);
});

test('all-time expense ledger uses the bounded historical range, not the current month fallback', async t => {
  t.mock.method(Category, 'find', () => queryChain([{ _id: '123456789012345678901239', name: 'Utilities', type: 'EXPENSE', isRentalHead: false, isMainHead: true }]));
  t.mock.method(Transaction, 'find', query => {
    assert.equal(query.transactionType, 'EXPENSE');
    assert.equal(query.date.$gte.toISOString(), '1899-12-31T19:00:00.000Z');
    return queryChain([{
      _id: '123456789012345678901240',
      date: new Date('2024-01-05T10:00:00Z'),
      voucherNo: 'VN-OLD',
      detail: 'Historic utility bill',
      amount: 1250,
      categoryId: { _id: '123456789012345678901239', name: 'Utilities', isRentalHead: false, isMainHead: true },
      crAccountId: { name: 'Cash' },
      drAccountId: { name: 'Utilities' },
      transactionType: 'EXPENSE',
      status: 'POSTED',
    }]);
  });
  const result = await executeFinancialTool('getFinancialLedger', { kind: 'EXPENSE', allTime: true }, viewer);
  assert.equal(result.report.summary.totalExpenses, 1250);
  assert.equal(result.report.rows[0].voucherNo, 'VN-OLD');
});
