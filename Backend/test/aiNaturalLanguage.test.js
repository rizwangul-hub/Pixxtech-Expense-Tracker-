import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isGreetingOrGeneralQuestion,
  getGreetingResponse,
  resolvePeriodFromText,
  extractEntitiesFromQuery,
  extractConversationalContext,
  resolveIntentAndToolCall,
} from '../services/ai/naturalLanguageResolver.js';
import {
  executeFinancialTool,
  validateToolArguments,
  FINANCIAL_TOOL_DECLARATIONS,
} from '../services/ai/financialTools.js';
import { runGeminiAssistant, runOpenAIAssistant } from '../services/ai/aiProvider.js';
import Employee from '../models/Employee.js';
import StaffLoan from '../models/StaffLoan.js';
import Payroll from '../models/Payroll.js';
import Property from '../models/Property.js';
import Account from '../models/Account.js';
import Transaction from '../models/Transaction.js';

const viewer = { _id: '123456789012345678901234', role: 'DATA_ENTRY', isActive: true, lastActiveAt: new Date() };
const queryChain = rows => ({
  select() { return this; },
  populate() { return this; },
  sort() { return this; },
  limit() { return this; },
  maxTimeMS() { return this; },
  lean: async () => rows,
});

function configureEnv(t, provider = 'gemini') {
  for (const [key, value] of Object.entries({
    AI_ENABLED: 'true',
    AI_PROVIDER: provider,
    AI_MODEL: 'gemini-3.5-flash',
    GEMINI_API_KEY: 'test-secret-key',
    OPENAI_API_KEY: 'test-secret-key',
    JWT_SECRET: 'test-jwt-secret',
  })) {
    const prev = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (prev === undefined) delete process.env[key];
      else process.env[key] = prev;
    });
  }
}

// 1. Phrasing Variations
test('AI Natural Language - Phrasing variations for employee salary map to getSalarySummary', () => {
  const variations = [
    "What is Rizwan's salary?",
    "Tell me Rizwan Ullah's salary.",
    "How much does Rizwan earn?",
    "Show salary details for Rizwan.",
    "Rizwan ki salary kitni hai?",
    "Rizwan ki monthly salary batao.",
  ];

  for (const phrase of variations) {
    const resolved = resolveIntentAndToolCall(phrase);
    assert.ok(resolved, `Failed to resolve phrase: ${phrase}`);
    assert.equal(resolved[0].name, 'getSalarySummary');
    assert.equal(resolved[0].args.employeeName, 'Rizwan');
  }
});

// 2. Roman Urdu Questions
test('AI Natural Language - Roman Urdu financial intents are correctly identified', () => {
  const testCases = [
    { query: 'Is month ka total kharcha kitna hai?', expectedTool: 'getExpenseSummary' },
    { query: 'Bank mein kitna balance hai?', expectedTool: 'getAccountBalances', expectedArgs: { accountType: 'BANK' } },
    { query: 'Kiraya kitna aya?', expectedTool: 'getRentCollectionSummary' },
    { query: 'Baqi kiraya kitna hai?', expectedTool: 'getOutstandingRent' },
    { query: 'Pichlay month ki income batao.', expectedTool: 'getIncomeSummary' },
  ];

  for (const tc of testCases) {
    const resolved = resolveIntentAndToolCall(tc.query);
    assert.ok(resolved, `Failed to resolve Roman Urdu query: ${tc.query}`);
    assert.equal(resolved[0].name, tc.expectedTool);
    if (tc.expectedArgs) {
      for (const [k, v] of Object.entries(tc.expectedArgs)) {
        assert.equal(resolved[0].args[k], v);
      }
    }
  }
});

// 3. Typo and Abbreviation Tolerance
test('AI Natural Language - Tolerates common spelling mistakes and informal abbreviations', () => {
  const typoCases = [
    { query: 'octobar expens total', expectedTool: 'getExpenseSummary', expectedMonth: 10 },
    { query: 'Rizwan salry kitni hai', expectedTool: 'getSalarySummary', expectedEmp: 'Rizwan' },
    { query: 'meezan ledger dikhao', expectedTool: 'getAccountLedger' },
    { query: 'give me ladger of Sabir Nawaz', expectedTool: 'getEmployeeLedger', expectedEmp: 'Sabir' },
    { query: 'novambar kharcha', expectedTool: 'getExpenseSummary', expectedMonth: 11 },
  ];

  for (const tc of typoCases) {
    const resolved = resolveIntentAndToolCall(tc.query);
    assert.ok(resolved, `Failed typo case: ${tc.query}`);
    assert.equal(resolved[0].name, tc.expectedTool);
    if (tc.expectedMonth) assert.equal(resolved[0].args.month, tc.expectedMonth);
    if (tc.expectedEmp) assert.equal(resolved[0].args.employeeName, tc.expectedEmp);
  }
});

test('AI Natural Language - Loan ledger PDF phrasing stays read-only', () => {
  const resolved = resolveIntentAndToolCall('give me loan ladger of Sabir Nawaz in pdf');
  assert.ok(resolved);
  assert.equal(resolved[0].name, 'getEmployeeLoanSummary');
  assert.equal(resolved[0].args.employeeName, 'Sabir');
});

// 4. Employee-Specific Salary Searches
test('AI Natural Language - Individual employee salary search retrieves profile and payroll', async t => {
  t.mock.method(Employee, 'findOne', () => queryChain({
    _id: 'emp-rizwan-id',
    name: 'Rizwan Ullah',
    designation: 'Senior Developer',
    department: 'IT Office',
    employmentStatus: 'ACTIVE',
    basicSalary: 85000,
    allowance: 5000,
  }));
  t.mock.method(Payroll, 'findOne', () => queryChain({
    grossSalary: 90000,
    netPayable: 88000,
    totalDeduction: 2000,
    paymentStatus: 'PAID',
    status: 'PAID',
  }));
  t.mock.method(StaffLoan, 'findOne', () => queryChain({
    newBalance: 15000,
  }));

  const res = await executeFinancialTool('getSalarySummary', { employeeName: 'Rizwan', month: 10, year: 2026 }, viewer);
  assert.equal(res.employeeName, 'Rizwan Ullah');
  assert.equal(res.basicSalary, 85000);
  assert.equal(res.netPayable, 88000);
  assert.equal(res.currentLoanBalance, 15000);
  assert.equal(res.payrollStatus, 'PAID');
});

// 5. Employee Cash Payments and Loans
test('AI Natural Language - Resolves cash payments and loan queries for staff', async t => {
  const query = 'Sabir ko kitna cash diya?';
  const resolved = resolveIntentAndToolCall(query);
  assert.ok(resolved);
  assert.equal(resolved[0].name, 'getSalarySummary');
  assert.equal(resolved[0].args.employeeName, 'Sabir');

  t.mock.method(Employee, 'findOne', () => queryChain({
    _id: 'emp-sabir-id',
    name: 'Sabir Nawaz',
    designation: 'Office Admin',
    basicSalary: 45000,
    allowance: 0,
  }));
  t.mock.method(Payroll, 'findOne', () => queryChain(null));
  t.mock.method(StaffLoan, 'findOne', () => queryChain({ newBalance: 5000 }));

  const toolRes = await executeFinancialTool('getSalarySummary', { employeeName: 'Sabir', month: 10, year: 2026 }, viewer);
  assert.equal(toolRes.employeeName, 'Sabir Nawaz');
  assert.equal(toolRes.currentLoanBalance, 5000);
});

// 6. Property-Specific Expense Searches
test('AI Natural Language - Property-specific financial summary resolves property entity', async t => {
  const query = 'Bahria Town performance for October';
  const resolved = resolveIntentAndToolCall(query);
  assert.ok(resolved);
  assert.equal(resolved[0].name, 'getPropertyFinancialSummary');
  assert.equal(resolved[0].args.propertyName, 'Bahria Town');
  assert.equal(resolved[0].args.month, 10);
});

// 7. Account-Specific Ledger Searches
test('AI Natural Language - Account-specific searches resolve account filter', () => {
  const query = 'Meezan Bank ledger statement';
  const resolved = resolveIntentAndToolCall(query);
  assert.ok(resolved);
  assert.equal(resolved[0].name, 'getAccountLedger');
  assert.equal(resolved[0].args.accountName, 'Meezan Bank');
});

test('AI Natural Language - Employee cash-hand ledger resolves the registered cash account', () => {
  const resolved = resolveIntentAndToolCall('Sabir cash hand ledger');
  assert.ok(resolved);
  assert.equal(resolved[0].name, 'getFinancialLedger');
  assert.equal(resolved[0].args.kind, 'ACCOUNT');
  assert.equal(resolved[0].args.accountName, 'Sabir');
});

// 8. Follow-up Questions Using Conversational Context Memory
test('AI Natural Language - Multi-turn conversational context carries forward active entity and topic', () => {
  // Turn 1: "Show me expenses for November."
  const turn1History = [];
  const turn1Context = extractConversationalContext('Show me expenses for November.', turn1History);
  assert.equal(turn1Context.currentPeriod.month, 11);

  // Turn 2: "What about October?" (follows November expenses)
  const turn2History = [{ role: 'user', content: 'Show me expenses for November.' }];
  const turn2Context = extractConversationalContext('What about October?', turn2History);
  assert.equal(turn2Context.isEllipticalFollowUp, true);
  assert.equal(turn2Context.inherited.topic, 'EXPENSES');
  assert.equal(turn2Context.currentPeriod.month, 10);

  const turn2Resolved = resolveIntentAndToolCall('What about October?', turn2Context);
  assert.ok(turn2Resolved);
  assert.equal(turn2Resolved[0].name, 'getExpenseSummary');
  assert.equal(turn2Resolved[0].args.month, 10);

  // Turn 3: "Compare both."
  const turn3History = [
    { role: 'user', content: 'Show me expenses for November.' },
    { role: 'user', content: 'What about October?' },
  ];
  const turn3Context = extractConversationalContext('Compare both.', turn3History);
  assert.equal(turn3Context.isComparisonQuery, true);

  const turn3Resolved = resolveIntentAndToolCall('Compare both.', turn3Context);
  assert.ok(turn3Resolved);
  assert.equal(turn3Resolved[0].name, 'getMonthlyComparison');
  assert.equal(turn3Resolved[0].args.month1, 10);
  assert.equal(turn3Resolved[0].args.month2, 11);

  // Turn 4: "Show Sabir's salary."
  // Turn 5: "What about last month?"
  const turn5History = [{ role: 'user', content: "Show Sabir's salary." }];
  const turn5Context = extractConversationalContext('What about last month?', turn5History);
  assert.equal(turn5Context.inherited.employeeName, 'Sabir');
  assert.equal(turn5Context.currentPeriod.isRelative, true);
  const turn5Resolved = resolveIntentAndToolCall('What about last month?', turn5Context);
  assert.ok(turn5Resolved);
  assert.equal(turn5Resolved[0].name, 'getSalarySummary');
  assert.equal(turn5Resolved[0].args.employeeName, 'Sabir');
});

// 9. Month and Year Resolution
test('AI Natural Language - Resolves dates in English and Roman Urdu relative to current date', () => {
  const refDate = new Date('2026-11-06T12:00:00Z');

  const thisMonth = resolvePeriodFromText('is month ka kharcha', refDate);
  assert.equal(thisMonth.month, 11);
  assert.equal(thisMonth.year, 2026);

  const lastMonth = resolvePeriodFromText('pichlay month ki income', refDate);
  assert.equal(lastMonth.month, 10);
  assert.equal(lastMonth.year, 2026);

  const explicitUrdu = resolvePeriodFromText('aktubar 2026 report', refDate);
  assert.equal(explicitUrdu.month, 10);
  assert.equal(explicitUrdu.year, 2026);
});

// 10. Greetings and General Questions
test('AI Natural Language - Handles greetings and capability questions without throwing errors', () => {
  const greetings = ['Hi', 'Hello', 'Salam', 'Assalam-o-Alaikum', 'AoA', 'Kaise ho?', 'What can you do?'];
  for (const g of greetings) {
    assert.equal(isGreetingOrGeneralQuestion(g), true, `Greeting detection failed for: ${g}`);
  }

  const greetingResponse = getGreetingResponse();
  assert.ok(greetingResponse.includes('Assalam-o-Alaikum'));
  assert.ok(greetingResponse.includes('Expenses'));
  assert.ok(greetingResponse.includes('Salaries'));
});

// 11. Clarification Requests for Ambiguous Queries
test('AI Natural Language - Ambiguous or incomplete query without context returns graceful limitation', async t => {
  configureEnv(t);
  const result = await runGeminiAssistant('xyz completely ambiguous nonsense 123', [], viewer, {
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'No tool call' }] } }] }),
    }),
  });
  assert.equal(result.toolCalls.length, 0);
  assert.ok(result.message.includes('not supported yet') || result.message.includes('specify a month'));
});

// 12. Cross-User Conversation Isolation
test('AI Natural Language - History isolation: does not leak state across independent calls', () => {
  const user1History = [{ role: 'user', content: 'What is Rizwan salary?' }];
  const user2History = [{ role: 'user', content: 'What is Bahria Town expense?' }];

  const user1FollowUp = extractConversationalContext('What about last month?', user1History);
  const user2FollowUp = extractConversationalContext('What about last month?', user2History);

  assert.equal(user1FollowUp.inherited.employeeName, 'Rizwan');
  assert.equal(user2FollowUp.inherited.employeeName, undefined);
  assert.equal(user2FollowUp.inherited.propertyName, 'Bahria Town');
});

// 13. Financial Accuracy vs Backend Calculations
test('AI Natural Language - Verified calculation grounding matches exact ledger and salary values', async t => {
  t.mock.method(Employee, 'findOne', () => queryChain({
    _id: 'emp-1',
    name: 'Rizwan Ullah',
    basicSalary: 100000,
    allowance: 12500,
    employmentStatus: 'ACTIVE',
  }));
  t.mock.method(Payroll, 'findOne', () => queryChain({
    grossSalary: 112500,
    netPayable: 110000,
    totalDeduction: 2500,
    paymentStatus: 'PAID',
  }));
  t.mock.method(StaffLoan, 'findOne', () => queryChain({ newBalance: 0 }));

  const salaryRes = await executeFinancialTool('getSalarySummary', { employeeName: 'Rizwan', month: 10, year: 2026 }, viewer);
  assert.equal(salaryRes.grossSalary, 112500);
  assert.equal(salaryRes.netPayable, 110000);
  assert.equal(salaryRes.totalDeductions, 2500);
});

// 14. Missing Entity Handling
test('AI Natural Language - Missing employee or property returns honest suggestion with available list', async t => {
  t.mock.method(Employee, 'findOne', () => queryChain(null));
  t.mock.method(Employee, 'find', () => queryChain([
    { name: 'Rizwan Ullah', designation: 'Developer' },
    { name: 'Sabir Nawaz', designation: 'Admin' },
  ]));

  const missingEmp = await executeFinancialTool('getSalarySummary', { employeeName: 'NonExistentPerson', month: 10, year: 2026 }, viewer);
  assert.ok(missingEmp.error.includes('NonExistentPerson'));
  assert.ok(Array.isArray(missingEmp.availableEmployees));
  assert.equal(missingEmp.availableEmployees.length, 2);

  t.mock.method(Property, 'findOne', () => queryChain(null));
  t.mock.method(Property, 'find', () => queryChain([
    { plazaName: 'Bahria Town' },
    { plazaName: '2nd Floor Deal Land' },
  ]));

  const missingProp = await executeFinancialTool('getPropertyFinancialSummary', { propertyName: 'Imaginary Tower', month: 10, year: 2026 }, viewer);
  assert.ok(missingProp.error.includes('Imaginary Tower'));
  assert.ok(Array.isArray(missingProp.availableProperties));
  assert.equal(missingProp.availableProperties.length, 2);
});
