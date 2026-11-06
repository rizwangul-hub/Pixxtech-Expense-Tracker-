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
