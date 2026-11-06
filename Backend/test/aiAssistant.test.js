import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveMonthDateRange, FINANCIAL_TOOL_DECLARATIONS } from '../services/ai/financialTools.js';
import { aiRateLimiter, validateAiQuestion } from '../middleware/aiRateLimit.js';
import { executeRuleBasedFallback } from '../services/ai/aiProvider.js';

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
