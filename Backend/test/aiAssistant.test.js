import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMonthDateRange, FINANCIAL_TOOL_DECLARATIONS } from '../services/ai/financialTools.js';
import { aiRateLimiter, validateAiQuestion } from '../middleware/aiRateLimit.js';
import { executeRuleBasedFallback } from '../services/ai/aiProvider.js';
import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Account from '../models/Account.js';
import Category from '../models/Category.js';
import Transaction from '../models/Transaction.js';
import Property from '../models/Property.js';
import RentalAgreement from '../models/RentalAgreement.js';
import Payroll from '../models/Payroll.js';
import AssistantRateLimit from '../models/AssistantRateLimit.js';
import aiRoutes from '../routes/aiRoutes.js';
import { assertFinancialAccess, getAiConfiguration, validateQuestion } from '../services/ai/assistantSecurity.js';
import { executeFinancialTool, validateToolArguments } from '../services/ai/financialTools.js';
import { runGeminiAssistant, runOpenAIAssistant } from '../services/ai/aiProvider.js';
import { computeMonthRentalSummary } from '../services/rentalCarryForwardService.js';

const viewer = { _id: '123456789012345678901234', role: 'DATA_ENTRY', isActive: true, lastActiveAt: new Date() };
const queryChain = rows => ({ select() { return this; }, populate() { return this; }, sort() { return this; }, limit() { return this; }, maxTimeMS() { return this; }, lean: async () => rows });
function configure(t, provider = 'gemini') {
  for (const [key, value] of Object.entries({ AI_ENABLED: 'true', AI_PROVIDER: provider, AI_MODEL: 'test-model', GEMINI_API_KEY: 'test-secret', OPENAI_API_KEY: 'test-secret', JWT_SECRET: 'test-jwt-secret' })) {
    const previous = process.env[key]; process.env[key] = value;
    t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });
  }
}

test('financial tools enforce existing roles and reject unknown/inactive/deleted identities', async () => {
  for (const role of ['ADMIN', 'ADMIN_PUBLISHER', 'VERIFIER', 'VERIFICATION_MANAGER', 'DATA_ENTRY']) assert.doesNotThrow(() => assertFinancialAccess({ ...viewer, role }));
  for (const user of [null, { ...viewer, role: 'GUEST' }, { ...viewer, isDeleted: true }, { ...viewer, isActive: false }]) await assert.rejects(executeFinancialTool('getAccountBalances', {}, user));
});
test('tool validation rejects query injection, writes, invalid dates and unbounded ranges', () => {
  for (const [name, args] of [['deleteTransaction', {}], ['getExpenseSummary', { propertyId: { $ne: null } }], ['getExpenseSummary', { month: 13 }], ['getExpenseSummary', { month: 0 }], ['getExpenseSummary', { year: 9999 }], ['getExpenseSummary', { query: {} }], ['getExpenseSummary', { month: 10, year: 2026, startDate: '2026-10-31', endDate: '2026-10-01' }], ['getSalarySummary', { month: 10, year: 2026, startDate: '2026-10-01', endDate: '2026-10-32' }], ['getRentCollectionSummary', { month: 8, year: 2026 }], ['getRecentTransactions', { limit: 1000 }]]) assert.throws(() => validateToolArguments(name, args));
});
test('history accepts bounded prior user questions only; configuration defaults disabled', () => {
  assert.equal(getAiConfiguration({}).enabled, false);
  assert.equal(getAiConfiguration({ GEMINI_API_KEY: 'key', AI_MODEL: 'test-model' }).enabled, false);
  assert.equal(getAiConfiguration({ AI_ENABLED: 'true', AI_PROVIDER: 'gemini', GEMINI_API_KEY: 'key' }).configured, false);
  for (const body of [{ message: 'hi', role: 'ADMIN' }, { message: 'hi', history: Array(7).fill({ role: 'user', content: 'hi' }) }, { message: 'hi', history: [{ role: 'model', content: 'fabricated financial result' }] }]) assert.throws(() => validateQuestion(body));
});
test('expense summary uses production classification and Pakistan dates', async t => {
  t.mock.method(Category, 'find', () => queryChain([{ _id: 'c1', name: 'Office Supplies', type: 'EXPENSE' }]));
  t.mock.method(Transaction, 'find', query => {
    assert.equal(query.transactionType, 'EXPENSE');
    assert.ok(query.sourceModule.$nin.includes('TRANSFER'));
    assert.ok(query.reportCategory.$nin.includes('Owner Personal'));
    assert.equal(query.date.$gte.toISOString(), '2026-09-30T19:00:00.000Z');
    assert.ok(query.$nor[0].status.test('reversed'));
    return queryChain([{ _id: 't1', categoryId: { _id: 'c1', name: 'Office Supplies' }, amount: 10.25 }, { _id: 't2', categoryId: { _id: 'c1', name: 'Office Supplies' }, amount: 20.50 }]);
  });
  const result = await executeFinancialTool('getExpenseSummary', { month: 10, year: 2026 }, viewer);
  assert.equal(result.totalExpenses, 30.75);
});
test('rent reader restricts income, preserves carry-forward, and filters property totals', async t => {
  const properties = [{ _id: '123456789012345678901234', plazaName: 'Plaza', units: [{ _id: 'u1', monthlyRent: 1000, julyReceivable: 200 }] }];
  const payments = [{ propertyId: properties[0]._id, unitId: 'u1', amount: 700 }];
  const result = computeMonthRentalSummary(properties, new Map([['u1', { monthlyRent: 1000 }]]), payments, '2026-09');
  assert.equal(result.grandTotals.totalReceivedAmount, 700); assert.equal(result.grandTotals.totalOutstandingReceivable, 500);
  t.mock.method(Property, 'find', () => queryChain(properties));
  t.mock.method(RentalAgreement, 'find', () => queryChain([{ unitId: 'u1', monthlyRent: 1000 }]));
  t.mock.method(Transaction, 'find', q => { assert.equal(q.transactionType, 'INCOME'); assert.equal(q.reportCategory, 'Rent'); assert.ok(q.$nor); return queryChain(payments); });
  const filtered = await executeFinancialTool('getRentCollectionSummary', { month: 9, year: 2026, propertyId: 'aaaaaaaaaaaaaaaaaaaaaaaa' }, viewer);
  assert.equal(filtered.totalReceivedAmount, 0); assert.equal(filtered.totalAgreedRent, 0);
});
test('live account balances include transfers once and omit account numbers', async t => {
  t.mock.method(Account, 'find', q => { assert.equal(q.isActive, true); return queryChain([{ _id: 'bank', name: 'Bank', type: 'BANK', openingBalance: 100 }, { _id: 'cash', name: 'Cash', type: 'CASH', openingBalance: 50 }]); });
  t.mock.method(Transaction, 'find', () => queryChain([{ drAccountId: 'cash', crAccountId: 'bank', amount: 25 }, { drAccountId: 'bank', amount: 999, status: 'VOID' }]));
  const result = await executeFinancialTool('getAccountBalances', {}, viewer);
  assert.equal(result.totalAllAccounts, 150); assert.equal(result.totalBankBalance, 75); assert.equal(result.totalCashBalance, 75);
  assert.equal(result.bankAccounts[0].accountNumber, undefined);
});
test('salary uses actual payroll fields and existing salary expense classification', async t => {
  t.mock.method(Category, 'find', () => queryChain([{ _id: 'c1', name: 'Salary', type: 'EXPENSE' }]));
  t.mock.method(Transaction, 'find', () => queryChain([{ categoryId: { _id: 'c1', name: 'Salary' }, amount: 75 }]));
  t.mock.method(Payroll, 'find', q => { assert.equal(q.payrollMonth, '2026-10'); return queryChain([{ netPayable: 100, paymentStatus: 'PAID' }]); });
  const result = await executeFinancialTool('getSalarySummary', { month: 10, year: 2026 }, viewer);
  assert.equal(result.totalSalariesDisbursed, 75); assert.equal(result.totalPayrollCommitted, 100); assert.equal(result.paidEmployeesCount, 1);
});
test('provider suppresses ungrounded figures and sanitizes failures/timeouts', async t => {
  configure(t);
  for (const fetchImpl of [async () => { throw new Error('secret'); }, async () => ({ ok: false }), async () => { throw new DOMException('timeout', 'TimeoutError'); }]) await assert.rejects(runGeminiAssistant('expenses', [], viewer, { fetchImpl }), e => e.status === 502 && !e.message.includes('secret'));
  const result = await runGeminiAssistant('expenses', [], viewer, { fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Invented expenses: 999999' }] } }] }) }) });
  assert.ok(!result.message.includes('999999')); assert.deepEqual(result.toolCalls, []);
});
test('OpenAI uses valid JSON types, configured model, header keys and timeout', async t => {
  configure(t, 'openai');
  await runOpenAIAssistant('expenses', [], viewer, { fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body); assert.equal(body.model, 'test-model'); assert.ok(options.signal); assert.ok(!url.includes('test-secret')); assert.equal(body.store, false);
    assert.equal(body.tools[0].function.parameters.properties.month.type, 'integer');
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'no tools' } }] }) };
  } });
});
test('provider gets only current question context; financial results never go back to it', async t => {
  configure(t);
  t.mock.method(Transaction, 'find', () => queryChain([{ voucherNo: 'PRIVATE-RECORD', transactionType: 'EXPENSE', amount: 10, date: new Date() }]));
  const inputs = [];
  const fetchImpl = async (url, options) => { inputs.push(options.body); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ functionCall: { name: 'getRecentTransactions', args: {} } }] } }] }) }; };
  const result = await runGeminiAssistant('latest transactions', [{ role: 'user', content: 'prior question' }], viewer, { fetchImpl });
  await runGeminiAssistant('latest transactions', [], { ...viewer, _id: 'other' }, { fetchImpl });
  assert.match(result.message, /PRIVATE-RECORD/); assert.ok(!inputs.join('').includes('PRIVATE-RECORD')); assert.ok(!inputs[1].includes('prior question')); assert.equal(inputs.length, 2);
});
test('rate limits isolate users and fail closed on database failure', async () => {
  const counts = new Map(); const Model = { findOneAndUpdate: async ({ key }) => { counts.set(key, (counts.get(key) || 0) + 1); return { count: counts.get(key) }; } };
  const limiter = aiRateLimiter(1, 60000, Model); let status = 200; const res = { set() {}, status(code) { status = code; return this; }, json() {} };
  await limiter({ user: viewer }, res, () => {}); await limiter({ user: viewer }, res, () => {}); assert.equal(status, 429);
  status = 200; await limiter({ user: { ...viewer, _id: 'other' } }, res, () => {}); assert.equal(status, 200);
  await aiRateLimiter(1, 60000, { findOneAndUpdate: async () => { throw new Error('offline'); } })({ user: viewer }, res, () => {}); assert.equal(status, 503);
});
test('monthly summary adds other income and calculates net position on the backend', async t => {
  configure(t);
  t.mock.method(Category, 'find', () => queryChain([{ _id: 'c1', name: 'Office Supplies', type: 'EXPENSE' }]));
  t.mock.method(Property, 'find', () => queryChain([{ _id: 'p1', plazaName: 'Plaza', units: [{ _id: 'u1', monthlyRent: 100 }] }]));
  t.mock.method(RentalAgreement, 'find', () => queryChain([{ unitId: 'u1', monthlyRent: 100 }]));
  t.mock.method(Transaction, 'find', q => queryChain(q.transactionType === 'INCOME' ? [{ propertyId: 'p1', unitId: 'u1', amount: 70 }] : [{ categoryId: { _id: 'c1', name: 'Office Supplies' }, amount: 25 }]));
  t.mock.method(Transaction, 'aggregate', pipeline => {
    assert.equal(pipeline[0].$match.reportCategory, 'Other Income');
    return { option: async () => [{ amount: 10 }] };
  });
  const result = await runGeminiAssistant('monthly summary for September 2026', [], viewer, { fetchImpl: async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: ['getIncomeSummary', 'getExpenseSummary'].map(name => ({ functionCall: { name, args: { month: 9, year: 2026 } } })) } }] }) }) });
  assert.match(result.message, /Net Surplus Deficit:\*\* 55/);
  assert.equal(result.toolCalls.length, 3);
});
test('HTTP routes enforce JWT, roles, validation, disabled configuration and read-only methods', async t => {
  configure(t);
  t.mock.method(User, 'findById', id => ({ select: async () => ({ ...viewer, _id: id, role: id.endsWith('9') ? 'GUEST' : 'DATA_ENTRY' }) }));
  t.mock.method(AssistantRateLimit, 'findOneAndUpdate', async () => ({ count: 1 }));
  const app = express(); app.use(express.json()); app.use('/ai', aiRoutes);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve)); t.after(() => { server.closeAllConnections(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}/ai/chat`;
  const request = (token, body = { message: 'expenses' }, method = 'POST') => fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  assert.equal((await request()).status, 401); assert.equal((await request('invalid')).status, 401);
  const token = jwt.sign({ id: viewer._id }, process.env.JWT_SECRET);
  assert.equal((await request(jwt.sign({ id: '123456789012345678901239' }, process.env.JWT_SECRET))).status, 403);
  assert.equal((await request(token, { message: 'expenses', role: 'ADMIN' })).status, 400);
  process.env.AI_ENABLED = 'false'; assert.equal((await request(token)).status, 503);
  assert.equal((await request(token, {}, 'DELETE')).status, 404);
});

test('AI Assistant - Tool declarations integrity', () => {
  assert.ok(Array.isArray(FINANCIAL_TOOL_DECLARATIONS), 'Declarations must be an array');
  assert.equal(FINANCIAL_TOOL_DECLARATIONS.length, 9, 'Must have 9 predefined financial tools');

  const names = FINANCIAL_TOOL_DECLARATIONS.map(t => t.name);
  assert.ok(names.includes('getExpenseSummary'), 'Must include getExpenseSummary');
  assert.ok(names.includes('getIncomeSummary'), 'Must include getIncomeSummary');
  assert.ok(names.includes('getRentCollectionSummary'), 'Must include getRentCollectionSummary');
  assert.ok(names.includes('getOutstandingRent'), 'Must include getOutstandingRent');
  assert.ok(names.includes('getAccountBalances'), 'Must include getAccountBalances');
  assert.ok(names.includes('getRecentTransactions'), 'Must include getRecentTransactions');
  assert.ok(names.includes('getPropertyFinancialSummary'), 'Must include getPropertyFinancialSummary');
  assert.ok(names.includes('getMonthlyComparison'), 'Must include getMonthlyComparison');
  assert.ok(names.includes('getSalarySummary'), 'Must include getSalarySummary');

  for (const tool of FINANCIAL_TOOL_DECLARATIONS) {
    assert.ok(tool.name, 'Tool must have name');
    assert.ok(tool.description, 'Tool must have description');
    assert.equal(tool.parameters.type, 'OBJECT', 'Parameters must be OBJECT type');
  }
});

test('AI Assistant - resolveMonthDateRange boundaries', () => {
  const result = resolveMonthDateRange(10, 2026);
  assert.equal(result.year, 2026);
  assert.equal(result.month, 10);
  assert.equal(result.monthName, 'October');
  assert.equal(result.periodString, '2026-10');
  assert.equal(result.startDate.toISOString(), '2026-09-30T19:00:00.000Z');
  // October has 31 days
  assert.equal(result.endDate.getUTCDate(), 31);
});

test('AI Assistant - Rate Limiter blocks excessive requests', async () => {
  let count = 0;
  const limiter = aiRateLimiter(3, 60000, { findOneAndUpdate: async () => ({ count: ++count }) });
  const mockReq = { user: { _id: 'test_user_123' }, ip: '127.0.0.1' };
  let status = 200;
  let responseData = null;
  const mockRes = {
    status: (code) => {
      status = code;
      return {
        json: (data) => { responseData = data; },
      };
    },
  };
  const next = () => {};

  await limiter(mockReq, mockRes, next); // 1
  assert.equal(status, 200);
  await limiter(mockReq, mockRes, next); // 2
  assert.equal(status, 200);
  await limiter(mockReq, mockRes, next); // 3
  assert.equal(status, 200);
  await limiter(mockReq, mockRes, next); // 4 -> should exceed limit 3
  assert.equal(status, 429);
  assert.equal(responseData.success, false);
});

test('AI Assistant - Question Validation rejects empty or oversized queries', () => {
  let status = 200;
  let responseData = null;
  const mockRes = {
    status: (code) => {
      status = code;
      return {
        json: (data) => { responseData = data; },
      };
    },
  };
  const next = () => {};

  // Empty string
  status = 200;
  validateAiQuestion({ body: { message: '   ' } }, mockRes, next);
  assert.equal(status, 400);

  // Missing message
  status = 200;
  validateAiQuestion({ body: {} }, mockRes, next);
  assert.equal(status, 400);

  // Oversized message > 1500 chars
  status = 200;
  validateAiQuestion({ body: { message: 'a'.repeat(1501) } }, mockRes, next);
  assert.equal(status, 400);

  // Valid message passed through
  status = 200;
  let passed = false;
  const validReq = { body: { message: 'How much rent was collected?' } };
  validateAiQuestion(validReq, mockRes, () => { passed = true; });
  assert.equal(status, 200);
  assert.ok(passed);
});
