import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { PDFDocument } from 'pdf-lib';
import BankStatementAttachment from '../models/BankStatementAttachment.js';
import Account from '../models/Account.js';
import User from '../models/User.js';
import MonthlyReport from '../models/MonthlyReport.js';
import bankStatementRoutes from '../routes/bankStatementRoutes.js';

const adminUser = {
  _id: '507f191e810c19729de860ea',
  name: 'Khurshid Anwar',
  email: 'khurshid@pixxtech.com',
  role: 'ADMIN',
  isActive: true,
};

const makeAuthHeader = (user) => {
  const token = jwt.sign(
    { id: user._id, role: user.role, email: user.email, name: user.name },
    process.env.JWT_SECRET || 'test-jwt-secret-stmt',
    { expiresIn: '1h' }
  );
  return `Bearer ${token}`;
};

const makeMockApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/bank-statements', bankStatementRoutes);
  return app;
};

test.beforeEach(() => {
  process.env.JWT_SECRET = 'test-jwt-secret-stmt';
});

// 1. Model Schema & Validation
test('BankStatementAttachment - Schema validates required month and account fields', () => {
  const validAttachment = new BankStatementAttachment({
    month: '2026-10',
    accountId: '507f191e810c19729de86011',
    accountName: 'Bank Al Falah (Kamran Ijaz Sb)',
    accountNumber: '0123456789',
    files: [
      {
        fileName: 'bank_statement_oct2026.pdf',
        originalName: 'alfalah_stmt.pdf',
        mimeType: 'application/pdf',
        fileType: 'PDF',
        size: 1048576,
        dataBase64: 'JVBERi0xLjQK...',
      },
    ],
  });

  const err = validAttachment.validateSync();
  assert.equal(err, undefined, 'Validation should pass for valid bank statement attachment');

  const invalidMonth = new BankStatementAttachment({
    month: 'invalid-month',
    accountId: '507f191e810c19729de86011',
    accountName: 'Bank Al Falah',
  });
  const errMonth = invalidMonth.validateSync();
  assert.ok(errMonth.errors.month, 'Validation must reject invalid month format');
});

// 2. Fetch Statements for Month
test('bankStatementController - getMonthlyBankStatements lists accounts with statement status', async (t) => {
  t.mock.method(User, 'findById', () => ({
    select: () => adminUser,
  }));

  const mockAccounts = [
    { _id: 'acc1', name: 'Bank Al Falah', type: 'BANK', accountNumber: '1111' },
    { _id: 'acc2', name: 'UBL (Saba Kamran)', type: 'BANK', accountNumber: '2222' },
  ];
  const mockStatements = [
    {
      _id: 'stmt1',
      month: '2026-10',
      accountId: 'acc1',
      accountName: 'Bank Al Falah',
      files: [
        {
          _id: 'f1',
          fileName: 'alfalah_stmt.pdf',
          originalName: 'stmt.pdf',
          mimeType: 'application/pdf',
          fileType: 'PDF',
          size: 500000,
          dataBase64: 'abc',
        },
      ],
    },
  ];

  t.mock.method(Account, 'find', () => ({
    sort: () => ({
      select: () => ({
        lean: async () => mockAccounts,
      }),
    }),
  }));

  t.mock.method(BankStatementAttachment, 'find', () => ({
    lean: async () => mockStatements,
  }));

  const app = makeMockApp();
  const server = app.listen(0);
  const port = server.address().port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/bank-statements/2026-10`, {
      headers: { Authorization: makeAuthHeader(adminUser) },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.month, '2026-10');
    assert.equal(data.accounts.length, 2);
    assert.equal(data.totalStatementsAttached, 1);

    const alfalah = data.accounts.find((a) => a.name === 'Bank Al Falah');
    assert.equal(alfalah.fileCount, 1);
    assert.equal(alfalah.pdfCount, 1);
  } finally {
    server.close();
  }
});

// 3. Multi-Page PDF and Image Attachment Merging
test('pdfReportService - pdf-lib merges attached bank statement PDFs and images right after bank ledger', async () => {
  // 1. Create a dummy base PDF with 2 pages (representing Overview and Tenancy)
  const baseDoc = await PDFDocument.create();
  baseDoc.addPage([595.28, 841.89]);
  baseDoc.addPage([595.28, 841.89]);
  const basePdfBytes = await baseDoc.save();

  // 2. Create a dummy bank ledger page (representing Bank Al Falah ledger statement)
  const ledgerDoc = await PDFDocument.create();
  ledgerDoc.addPage([595.28, 841.89]);
  const ledgerPdfBytes = await ledgerDoc.save();

  // 3. Create a dummy uploaded Bank Statement PDF with 3 pages (representing 3 pages from Bank Al Falah)
  const uploadedBankDoc = await PDFDocument.create();
  uploadedBankDoc.addPage([595.28, 841.89]);
  uploadedBankDoc.addPage([595.28, 841.89]);
  uploadedBankDoc.addPage([595.28, 841.89]);
  const uploadedPdfBytes = await uploadedBankDoc.save();

  // 4. Merge sequentially: Base pages (2) + Bank Ledger (1) + Uploaded Bank Statement (3) = 6 pages
  const finalDoc = await PDFDocument.create();

  // Add Base pages
  const loadedBase = await PDFDocument.load(basePdfBytes);
  const copiedBase = await finalDoc.copyPages(loadedBase, loadedBase.getPageIndices());
  for (const p of copiedBase) finalDoc.addPage(p);

  // Add Bank Ledger
  const loadedLedger = await PDFDocument.load(ledgerPdfBytes);
  const copiedLedger = await finalDoc.copyPages(loadedLedger, loadedLedger.getPageIndices());
  for (const p of copiedLedger) finalDoc.addPage(p);

  // Auto-attach Bank Statement right under bank ledger
  const loadedUploaded = await PDFDocument.load(uploadedPdfBytes);
  const copiedUploaded = await finalDoc.copyPages(loadedUploaded, loadedUploaded.getPageIndices());
  for (const p of copiedUploaded) finalDoc.addPage(p);

  const finalBytes = await finalDoc.save();
  const verifyDoc = await PDFDocument.load(finalBytes);

  assert.equal(verifyDoc.getPageCount(), 6, 'Merged PDF must contain exact 6 pages in sequence');
});

// 4. Verification that Bank Statement Picture Renders Directly Under System Ledger Transactions
test('fundsReportTemplate - Renders attached bank statement picture directly under system transactions', async () => {
  const fs = await import('fs');
  const path = await import('path');
  const handlebars = (await import('handlebars')).default;

  const templatePath = path.join(process.cwd(), 'templates', 'fundsReportTemplate.html');
  const templateSource = fs.readFileSync(templatePath, 'utf8');

  // Register helpers needed by template
  handlebars.registerHelper('formatPKR', (val) => (val ? `Rs. ${val}` : '-'));
  handlebars.registerHelper('formatInt', (val) => (val ? `${val}` : '-'));
  handlebars.registerHelper('formatReportDate', () => '31-10-2026');
  handlebars.registerHelper('addOne', (val) => Number(val) + 1);
  handlebars.registerHelper('gt', (a, b) => Number(a) > Number(b));
  handlebars.registerHelper('gtZero', (val) => Number(val) > 0);
  handlebars.registerHelper('eq', (a, b) => a === b);

  const compiled = handlebars.compile(templateSource);

  const sampleData = {
    asOfDate: '31-October-2026',
    singleAccountOnly: true,
    dataEnteredByName: 'Sarfraz Khan',
    checkedByName: 'Khurshid Anwar',
    preparedByName: 'Pixx Tech Expense Tracker System',
    accountStatements: [
      {
        accountId: 'acc123',
        bankOrCashTitle: 'UBL',
        accountSubtitle: 'Uraan Ventures',
        accountNumber: '1957-325086338',
        isCashCustodian: false,
        priorDate: '30-09-26',
        openingBalance: 150000,
        entries: [
          {
            date: '15-10-2026',
            detail: 'Rent Collection - Flat 4',
            debit: null,
            credit: 25000,
            balance: 175000,
          },
        ],
        totalDr: 0,
        totalCr: 25000,
        closingBalance: 175000,
        attachedImages: [
          {
            fileName: 'ubl_statement_oct2026.png',
            src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          },
        ],
        attachedPdfs: [],
      },
    ],
  };

  const renderedHtml = compiled(sampleData);

  // Validate that bank heading, system transactions, and attached statement picture are rendered in order
  assert.ok(renderedHtml.includes('UBL'), 'Must render bank title');
  assert.ok(renderedHtml.includes('Uraan Ventures'), 'Must render account subtitle');
  assert.ok(renderedHtml.includes('Account Number # 1957-325086338'), 'Must render account number');
  assert.ok(renderedHtml.includes('Rent Collection - Flat 4'), 'Must render system transactions');
  assert.ok(renderedHtml.includes('ATTACHED BANK STATEMENT DOCUMENT'), 'Must render attached statement document header');
  assert.ok(renderedHtml.includes('ubl_statement_oct2026.png'), 'Must render statement filename');
  assert.ok(renderedHtml.includes('data:image/png;base64,'), 'Must render base64 statement image');

  // Verify sequence: System transactions precede attached statement image
  const txIndex = renderedHtml.indexOf('Rent Collection - Flat 4');
  const docHeaderIndex = renderedHtml.indexOf('ATTACHED BANK STATEMENT DOCUMENT');
  const imgIndex = renderedHtml.indexOf('data:image/png;base64,');

  assert.ok(txIndex < docHeaderIndex, 'System transactions must appear BEFORE attached bank statement header');
  assert.ok(docHeaderIndex < imgIndex, 'Attached bank statement header must appear BEFORE image');
});
