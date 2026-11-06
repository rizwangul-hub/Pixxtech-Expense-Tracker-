import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import {
  isPdfReportRequest,
  storePdfReport,
  getPdfReport,
  clearStoredPdfReports,
  generateAiPdfReport,
  regeneratePdfReport,
  reportGenerators,
} from '../services/ai/aiPdfReportService.js';
import aiRoutes from '../routes/aiRoutes.js';
import User from '../models/User.js';
import Account from '../models/Account.js';
import Employee from '../models/Employee.js';
import Property from '../models/Property.js';
import Tenant from '../models/Tenant.js';
import Category from '../models/Category.js';
import StaffLoan from '../models/StaffLoan.js';
import AssistantRateLimit from '../models/AssistantRateLimit.js';
import { Attendance } from '../models/Attendance.js';

const adminUser = {
  _id: '111111111111111111111111',
  name: 'Fahad Rasheed',
  email: 'fahad@pixxtech.com',
  role: 'ADMIN',
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

const queryChain = (rows) => {
  const chain = {
    select() { return this; },
    populate() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean: async () => rows,
    then(resolve, reject) {
      return Promise.resolve(rows).then(resolve, reject);
    },
  };
  return chain;
};

const mockEntities = (t, { accounts = [], employees = [], properties = [], tenants = [], categories = [] } = {}) => {
  t.mock.method(Account, 'find', () => queryChain(accounts));
  t.mock.method(Employee, 'find', () => queryChain(employees));
  t.mock.method(Property, 'find', () => queryChain(properties));
  t.mock.method(Tenant, 'find', () => queryChain(tenants));
  t.mock.method(Category, 'find', () => queryChain(categories));
};

const makeMockApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRoutes);
  return app;
};

const makeAuthHeader = (user) => {
  const token = jwt.sign(
    { id: user._id, role: user.role, email: user.email },
    process.env.JWT_SECRET || 'test-jwt-secret-pdf',
    { expiresIn: '1h' }
  );
  return `Bearer ${token}`;
};

test.beforeEach((t) => {
  clearStoredPdfReports();
  process.env.JWT_SECRET = 'test-jwt-secret-pdf';
  process.env.AI_ENABLED = 'true';
  process.env.AI_PROVIDER = 'gemini';
  process.env.AI_MODEL = 'gemini-flash-lite-latest';
  process.env.GEMINI_API_KEY = 'test-key';

  if (t?.mock?.method) {
    t.mock.method(AssistantRateLimit, 'findOneAndUpdate', async () => ({ count: 1 }));
  }
});

// 1. Natural Language PDF Intent Recognition
test('AI PDF - Natural language intent detection across English and Roman Urdu', () => {
  // English phrases
  assert.equal(isPdfReportRequest('Give me Bank Al Falah (Kamran Ijaz Sb) ledger in PDF'), true);
  assert.equal(isPdfReportRequest("Generate Sabir's cash-in-hand monthly ledger PDF"), true);
  assert.equal(isPdfReportRequest("Give me Rizwan Ullah's complete salary ledger in PDF"), true);
  assert.equal(isPdfReportRequest('Generate the monthly expense report in PDF'), true);
  assert.equal(isPdfReportRequest('Generate an attendance report for all employees in PDF'), true);
  assert.equal(isPdfReportRequest('Generate a Profit & Loss report for October 2026 in PDF'), true);
  assert.equal(isPdfReportRequest('Download all transactions report'), true);
  assert.equal(isPdfReportRequest('Provide account statement document'), true);

  // Roman Urdu phrases
  assert.equal(isPdfReportRequest('Bank Al Falah ka ledger pdf mein do'), true);
  assert.equal(isPdfReportRequest('Sabir ka cash ledger pdf banao'), true);
  assert.equal(isPdfReportRequest('Rizwan ki salary slip pdf chahiye'), true);
  assert.equal(isPdfReportRequest('Monthly kharcha report pdf bhejo'), true);

  // Non-PDF regular queries
  assert.equal(isPdfReportRequest('What is our current bank balance?'), false);
  assert.equal(isPdfReportRequest('How much rent did we collect this month?'), false);
  assert.equal(isPdfReportRequest('Record Rs 5,000 electricity expense'), false);
  assert.equal(isPdfReportRequest('Transfer Rs 100,000 from UBL to Bank Al Falah'), false);
});

// 2. In-Memory Ephemeral Storage and Retrieval
test('AI PDF - Ephemeral token store, TTL check, and clearing', async () => {
  const dummyBuffer = Buffer.from('%PDF-1.4 test pdf content');
  const token = await storePdfReport({
    buffer: dummyBuffer,
    fileName: 'Test_Report.pdf',
    title: 'Test Report',
    user: adminUser,
  });

  assert.ok(typeof token === 'string' && (token.startsWith('pdf_') || token.startsWith('pdfv1.')));

  const item = await getPdfReport(token);
  assert.ok(item);
  assert.equal(item.fileName, 'Test_Report.pdf');
  assert.equal(item.title, 'Test Report');
  assert.equal(item.sizeBytes, dummyBuffer.length);
  assert.deepEqual(item.buffer, dummyBuffer);

  // Invalid token check
  assert.equal(await getPdfReport('non_existent_token'), null);

  // Clear store check
  clearStoredPdfReports();
  assert.equal(await getPdfReport(token), null);
});

// 3. Bank / Cash Account Ledger PDF Generation
test('AI PDF - Generate Bank Account Ledger PDF via ledgerController & pdfReportService', async (t) => {
  const accountId = '507f191e810c19729de86001';
  mockEntities(t, {
    accounts: [
      { _id: accountId, name: 'Bank Al Falah (Kamran Ijaz Sb)', type: 'BANK', isActive: true },
      { _id: '507f191e810c19729de86002', name: 'Sabir Cash Hand', type: 'CASH', isActive: true },
    ],
  });

  t.mock.method(reportGenerators, 'getLedgerReportData', async () => ({
    type: 'BANK',
    ledgerTitle: 'Bank Al Falah (Kamran Ijaz Sb)',
    datePreset: 'CUSTOM',
    summary: {
      openingBalance: 150000,
      totalDebit: 50000,
      totalCredit: 200000,
      closingBalance: 300000,
      entryCount: 4,
    },
    entries: [],
  }));

  const mockPdfBuffer = Buffer.from('%PDF-1.4 mock bank ledger');
  t.mock.method(reportGenerators, 'generateLedgerPDF', async () => mockPdfBuffer);

  const result = await generateAiPdfReport('Give me Bank Al Falah (Kamran Ijaz Sb) ledger in PDF', adminUser);

  assert.equal(result.success, true);
  assert.ok(result.pdfReport);
  assert.ok(result.pdfReport.downloadUrl.startsWith('/api/ai/download-report/'));
  assert.equal(result.pdfReport.fileName, 'Bank_Al_Falah_Kamran_Ijaz_Sb_Account_Ledger.pdf');
  assert.equal(result.pdfReport.reportType, 'ACCOUNT_LEDGER');
  assert.match(result.message, /Closing Balance.*PKR 300,000/);
});

test('AI PDF - Encrypted download token regenerates after in-memory instance loss', async (t) => {
  const accountId = '507f191e810c19729de86001';
  mockEntities(t, {
    accounts: [{ _id: accountId, name: 'Bank Al Falah', type: 'BANK', isActive: true }],
  });

  t.mock.method(reportGenerators, 'getLedgerReportData', async () => ({
    type: 'BANK',
    ledgerTitle: 'Bank Al Falah',
    datePreset: 'CUSTOM',
    summary: { openingBalance: 0, totalDebit: 0, totalCredit: 1000, closingBalance: 1000, entryCount: 1 },
    entries: [],
  }));

  const expectedBuffer = Buffer.from('%PDF-1.4 regenerated report');
  t.mock.method(reportGenerators, 'generateLedgerPDF', async () => expectedBuffer);

  const generated = await generateAiPdfReport('Give me Bank Al Falah ledger in PDF', adminUser);
  const token = generated.pdfReport.downloadUrl.split('/').pop();
  clearStoredPdfReports();

  const regenerated = await regeneratePdfReport(token, adminUser);
  assert.ok(regenerated);
  assert.deepEqual(regenerated.buffer, expectedBuffer);
  assert.equal(regenerated.fileName, 'Bank_Al_Falah_Account_Ledger.pdf');
});

// 4. Employee Salary Ledger PDF Generation
test('AI PDF - Generate Employee Salary Ledger PDF via payrollController', async (t) => {
  const employeeId = '507f191e810c19729de86003';
  mockEntities(t, {
    employees: [
      { _id: employeeId, name: 'Rizwan Ullah', designation: 'Manager IT', basicSalary: 85000, employmentStatus: 'ACTIVE' },
    ],
  });

  t.mock.method(reportGenerators, 'readPayrollEmployeeLedger', async (req, res) => {
    return res.json({
      success: true,
      data: {
        employee: { _id: employeeId, name: 'Rizwan Ullah', basicSalary: 85000 },
        ledger: [
          { date: '2026-10-01', month: 'October 2026', type: 'SALARY_ACCRUAL', accruedAmount: 85000, paidAmount: 0 },
          { date: '2026-10-05', month: 'October 2026', type: 'PAYMENT', accruedAmount: 0, paidAmount: 85000, payingAccount: 'Bank Al Falah' },
        ],
      },
    });
  });

  const mockPdfBuffer = Buffer.from('%PDF-1.4 mock salary ledger');
  t.mock.method(reportGenerators, 'generateLedgerPDF', async () => mockPdfBuffer);

  const result = await generateAiPdfReport("Give me Rizwan Ullah's complete salary ledger in PDF", adminUser);

  assert.equal(result.success, true);
  assert.ok(result.pdfReport);
  assert.equal(result.pdfReport.fileName, 'Salary_Ledger_Rizwan_Ullah.pdf');
  assert.equal(result.pdfReport.reportType, 'SALARY_LEDGER');
  assert.match(result.message, /Salary Accrued.*PKR 85,000/);
});

// 5. Staff Loan Ledger PDF Generation
test('AI PDF - Generate Staff Loan Ledger PDF via StaffLoan model', async (t) => {
  const employeeId = '507f191e810c19729de86004';
  mockEntities(t, {
    employees: [
      { _id: employeeId, name: 'Sabir Khan', designation: 'Office Boy', employmentStatus: 'ACTIVE' },
    ],
  });

  t.mock.method(StaffLoan, 'find', () => queryChain([
    {
      loanDate: new Date('2026-08-01'),
      loanAmount: 30000,
      monthlyDeduction: 5000,
      reason: 'Personal Emergency',
      status: 'ACTIVE',
      repayments: [
        { repaymentDate: new Date('2026-09-01'), amount: 5000, repaymentMethod: 'SALARY_DEDUCTION', notes: 'Sept salary deduction' },
        { repaymentDate: new Date('2026-10-01'), amount: 5000, repaymentMethod: 'SALARY_DEDUCTION', notes: 'Oct salary deduction' },
      ],
    },
  ]));

  const mockPdfBuffer = Buffer.from('%PDF-1.4 mock loan ledger');
  t.mock.method(reportGenerators, 'generateLedgerPDF', async () => mockPdfBuffer);

  const result = await generateAiPdfReport("Give me Sabir Khan's loan ledger in PDF", adminUser);

  assert.equal(result.success, true);
  assert.ok(result.pdfReport);
  assert.equal(result.pdfReport.fileName, 'Loan_Ledger_Sabir_Khan.pdf');
  assert.equal(result.pdfReport.reportType, 'LOAN_LEDGER');
  assert.match(result.message, /Total Loan Disbursed.*PKR 30,000/);
});

// 6. Clarification Prompts when Target Entity is Unspecified
test('AI PDF - Clarification prompt when bank account is not named', async (t) => {
  mockEntities(t, {
    accounts: [
      { name: 'Bank Al Falah', type: 'BANK', isActive: true },
      { name: 'UBL Bank', type: 'BANK', isActive: true },
    ],
  });

  const result = await generateAiPdfReport('Give me bank ledger in PDF', adminUser);

  assert.equal(result.isClarification, true);
  assert.match(result.message, /Please specify which account ledger you would like in PDF/);
  assert.match(result.message, /Bank Al Falah/);
});

// 7. Full Integration HTTP Test: POST /api/ai/chat and GET /api/ai/download-report/:token
test('AI PDF HTTP - Complete flow: Request PDF in chat, obtain token, and download PDF file', async (t) => {
  t.mock.method(AssistantRateLimit, 'findOneAndUpdate', async () => ({ count: 1 }));
  t.mock.method(User, 'findById', () => queryChain(adminUser));

  const accountId = '507f191e810c19729de86001';
  mockEntities(t, {
    accounts: [
      { _id: accountId, name: 'Bank Al Falah', type: 'BANK', isActive: true },
    ],
  });

  t.mock.method(reportGenerators, 'getLedgerReportData', async () => ({
    type: 'BANK',
    ledgerTitle: 'Bank Al Falah',
    datePreset: 'CUSTOM',
    summary: {
      openingBalance: 100000,
      totalDebit: 20000,
      totalCredit: 50000,
      closingBalance: 130000,
      entryCount: 2,
    },
    entries: [],
  }));

  const expectedBuffer = Buffer.from('%PDF-1.4 Mocked Official PDF Byte Stream');
  t.mock.method(reportGenerators, 'generateLedgerPDF', async () => expectedBuffer);

  const app = makeMockApp();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    // 1. Post Chat Query requesting PDF
    const chatRes = await fetch(`http://127.0.0.1:${port}/api/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: makeAuthHeader(adminUser),
      },
      body: JSON.stringify({ message: 'Give me Bank Al Falah ledger in PDF' }),
    });

    assert.equal(chatRes.status, 200);
    const chatData = await chatRes.json();
    assert.equal(chatData.success, true);
    assert.ok(chatData.pdfReport);
    assert.ok(chatData.pdfReport.downloadUrl);

    const downloadPath = chatData.pdfReport.downloadUrl;
    // Simulate Vercel routing the download to a fresh function instance.
    clearStoredPdfReports();

    // 2. Download the Generated PDF
    const downloadRes = await fetch(`http://127.0.0.1:${port}${downloadPath}`, {
      method: 'GET',
      headers: {
        Authorization: makeAuthHeader(adminUser),
      },
    });

    assert.equal(downloadRes.status, 200);
    assert.equal(downloadRes.headers.get('content-type'), 'application/pdf');
    assert.match(downloadRes.headers.get('content-disposition'), /attachment; filename=/);

    const downloadedBytes = Buffer.from(await downloadRes.arrayBuffer());
    assert.deepEqual(downloadedBytes, expectedBuffer);

    // 3. Attempt invalid token download -> 404
    const notFoundRes = await fetch(`http://127.0.0.1:${port}/api/ai/download-report/invalid_token_123`, {
      method: 'GET',
      headers: {
        Authorization: makeAuthHeader(adminUser),
      },
    });
    assert.equal(notFoundRes.status, 404);
  } finally {
    server.close();
  }
});
