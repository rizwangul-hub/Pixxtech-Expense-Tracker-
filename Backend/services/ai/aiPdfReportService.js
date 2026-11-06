import crypto from 'node:crypto';
import mongoose from 'mongoose';
import Account from '../../models/Account.js';
import Employee from '../../models/Employee.js';
import Property from '../../models/Property.js';
import Category from '../../models/Category.js';
import StaffLoan from '../../models/StaffLoan.js';
import Transaction from '../../models/Transaction.js';
import { Attendance } from '../../models/Attendance.js';
import { resolveEntities } from './transactionIntentResolver.js';
import { resolvePeriodFromText } from './naturalLanguageResolver.js';
import { getLedgerReportData } from '../../controllers/ledgerController.js';
import {
  generateLedgerPDF,
  generateMonthlyFundsReport,
  generateAllTransactionsPDF,
} from '../pdfReportService.js';
import { round2 } from '../ledgerService.js';
import { getUtcMonthDateRange } from '../salaryReportingService.js';
import { getEmployeeLedger as readPayrollEmployeeLedger } from '../../controllers/payrollController.js';
import { getJwtSecret } from '../../config/jwt.js';

// Exported generator registry allowing deterministic testing and mocking
export const reportGenerators = {
  getLedgerReportData,
  generateLedgerPDF,
  generateMonthlyFundsReport,
  generateAllTransactionsPDF,
  readPayrollEmployeeLedger,
};

// Fast-path in-memory store for generated PDF buffers (60 min TTL). Vercel
// functions are stateless between invocations, so download tokens also carry
// an encrypted, authenticated report request for safe regeneration elsewhere.
const pdfReportStore = new Map();
const PDF_TTL_MS = 60 * 60 * 1000; // 1 hour
const PDF_TOKEN_PREFIX = 'pdfv1';

const base64UrlEncode = (value) => Buffer.from(value).toString('base64url');
const base64UrlDecode = (value) => Buffer.from(value, 'base64url');

const pdfTokenKey = () => {
  const secret = getJwtSecret();
  if (!secret) return null;
  return crypto.createHash('sha256').update(`pixx-ai-pdf:${secret}`).digest();
};

const encryptPdfDescriptor = (descriptor) => {
  const key = pdfTokenKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(descriptor), 'utf8'),
    cipher.final(),
  ]);
  return [
    PDF_TOKEN_PREFIX,
    base64UrlEncode(iv),
    base64UrlEncode(cipher.getAuthTag()),
    base64UrlEncode(ciphertext),
  ].join('.');
};

const decryptPdfDescriptor = (token) => {
  if (typeof token !== 'string' || token.length > 10000) return null;
  const [prefix, ivPart, tagPart, ciphertextPart] = token.split('.');
  if (prefix !== PDF_TOKEN_PREFIX || !ivPart || !tagPart || !ciphertextPart) return null;

  const key = pdfTokenKey();
  if (!key) return null;

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, base64UrlDecode(ivPart));
    decipher.setAuthTag(base64UrlDecode(tagPart));
    const plaintext = Buffer.concat([
      decipher.update(base64UrlDecode(ciphertextPart)),
      decipher.final(),
    ]).toString('utf8');
    const descriptor = JSON.parse(plaintext);
    if (!descriptor || typeof descriptor !== 'object' || typeof descriptor.expiresAt !== 'number') return null;
    if (descriptor.expiresAt < Date.now()) return null;
    return descriptor;
  } catch {
    return null;
  }
};

const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [token, item] of pdfReportStore.entries()) {
    if (item.expiresAt < now) {
      pdfReportStore.delete(token);
    }
  }
}, 5 * 60 * 1000);
cleanupInterval.unref();

export function storePdfReport({ buffer, fileName, title, user, mimeType = 'application/pdf', sourceMessage = '' }) {
  const now = Date.now();
  const descriptor = {
    sourceMessage: typeof sourceMessage === 'string' ? sourceMessage.slice(0, 1500) : '',
    userId: user?._id ? String(user._id) : null,
    tokenVersion: user?.tokenVersion ?? 0,
    fileName,
    title,
    mimeType,
    sizeBytes: buffer?.length || 0,
    createdAt: now,
    expiresAt: now + PDF_TTL_MS,
  };
  const token = descriptor.sourceMessage && descriptor.userId
    ? encryptPdfDescriptor(descriptor) || `pdf_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`
    : `pdf_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  pdfReportStore.set(token, {
    token,
    buffer,
    fileName,
    title,
    userId: descriptor.userId,
    userRole: user?.role || 'VIEWER',
    mimeType,
    sizeBytes: buffer?.length || 0,
    createdAt: now,
    expiresAt: now + PDF_TTL_MS,
    sourceMessage: descriptor.sourceMessage,
    tokenVersion: descriptor.tokenVersion,
  });
  return token;
}

export function getPdfReport(token) {
  if (!token || !pdfReportStore.has(token)) return null;
  const item = pdfReportStore.get(token);
  if (item.expiresAt < Date.now()) {
    pdfReportStore.delete(token);
    return null;
  }
  return item;
}

export function getPdfReportDescriptor(token, user) {
  const descriptor = decryptPdfDescriptor(token);
  if (!descriptor || !descriptor.sourceMessage || !descriptor.userId) return null;
  if (String(descriptor.userId) !== String(user?._id)) return null;
  if ((descriptor.tokenVersion ?? 0) !== (user?.tokenVersion ?? 0)) return null;
  return descriptor;
}

export async function regeneratePdfReport(token, user) {
  const descriptor = getPdfReportDescriptor(token, user);
  if (!descriptor) return null;

  const result = await generateAiPdfReport(descriptor.sourceMessage, user);
  const regeneratedToken = result?.pdfReport?.downloadUrl?.split('/').pop();
  if (!regeneratedToken) return null;
  return getPdfReport(regeneratedToken);
}

export function clearStoredPdfReports() {
  pdfReportStore.clear();
}

/**
 * Detect whether user prompt is explicitly requesting a PDF report or download
 */
export function isPdfReportRequest(text) {
  if (!text || typeof text !== 'string') return false;
  const clean = text.toLowerCase();

  const hasPdfKeyword = /\b(pdf|p\.d\.f|download|document|doc|soft\s*copy)\b/i.test(clean);
  const hasReportKeyword = /\b(ledger|report|statement|sheet|hisaab|hisab|slip|summary|khata|p&l|profit\s*(&|and)\s*loss|transactions?|vouchers?|attendance|hazri)\b/i.test(clean);
  const hasRequestVerb = /\b(give|get|generate|send|download|provide|banao|nikalo|bhejo|chahiye|dikhao|do)\b/i.test(clean);

  // If user explicitly asks for "PDF" or "... in PDF"
  if (hasPdfKeyword && (hasReportKeyword || hasRequestVerb)) return true;

  // "Download ... report/ledger"
  if (/\bdownload\b/i.test(clean) && hasReportKeyword) return true;

  // Direct phrases e.g. "PDF report of ...", "generate PDF"
  if (/generate\s+.*pdf/i.test(clean) || /pdf\s+mein\b/i.test(clean) || /in\s+pdf\b/i.test(clean)) return true;

  return false;
}

/**
 * Format bytes to human readable string (e.g. 142 KB)
 */
function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 KB';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

/**
 * Master PDF Dispatcher and Generator
 */
export async function generateAiPdfReport(message, user) {
  const clean = message.toLowerCase();
  const period = resolvePeriodFromText(message);
  const entities = await resolveEntities(message);

  const monthYearStr = `${period.year}-${String(period.month).padStart(2, '0')}`;
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const monthLabel = `${monthNames[period.month - 1]} ${period.year}`;

  // 1. PROFIT & LOSS / MONTHLY FUNDS REPORT
  const isProfitLoss = /\b(profit\s*(?:&|and)\s*loss|p&l|funds?\s*report|monthly\s*(?:financial\s*)?report|macro\s*report)\b/i.test(clean);
  if (isProfitLoss) {
    return await handleProfitLossPdf({ monthYearStr, monthLabel, user, sourceMessage: message });
  }

  // 2. ATTENDANCE REPORT
  const isAttendance = /\b(attendance|hazri|present|absent|leave)\b/i.test(clean);
  if (isAttendance) {
    return await handleAttendancePdf({ entities, period, monthYearStr, monthLabel, user, sourceMessage: message });
  }

  // 3. EMPLOYEE LOAN LEDGER
  const isLoan = /\b(loan|karz|qarz|borrowing|advance\s*ledger)\b/i.test(clean);
  if (isLoan && (entities.employee || entities.employees?.length > 0)) {
    const emp = entities.employee || entities.employees[0];
    return await handleLoanLedgerPdf({ employee: emp, user, sourceMessage: message });
  }

  // 4. SALARY LEDGER / PAYSLIP
  const isSalary = /\b(salary|tankhwah|tanha|payroll|payslip|pay\s*slip)\b/i.test(clean);
  if (isSalary && (entities.employee || entities.employees?.length > 0)) {
    const emp = entities.employee || entities.employees[0];
    return await handleSalaryLedgerPdf({ employee: emp, user, sourceMessage: message });
  }

  // 5. BANK OR CASH ACCOUNT LEDGER / STATEMENT
  const isAccountOrBank = /\b(account|bank|cash|custodian|statement|balance)\b/i.test(clean) || entities.account || entities.accounts?.length > 0;
  if (isAccountOrBank && (entities.account || entities.accounts?.length > 0)) {
    const acc = entities.account || entities.accounts[0];
    const isMonthlySpecific = !/\b(complete|all\s*time|full|all\s*transactions)\b/i.test(clean) && !period.isRelative;
    return await handleAccountLedgerPdf({
      account: acc,
      monthYearStr: isMonthlySpecific ? monthYearStr : null,
      monthLabel: isMonthlySpecific ? monthLabel : 'All Time',
      user,
      sourceMessage: message,
    });
  }

  // 6. PROPERTY / UNIT REPORT
  const isProperty = /\b(property|plaza|flat|unit|commercial|building)\b/i.test(clean) || entities.property || entities.properties?.length > 0;
  if (isProperty && (entities.property || entities.properties?.length > 0)) {
    const prop = entities.property || entities.properties[0];
    return await handlePropertyLedgerPdf({
      property: prop,
      unit: entities.unit,
      user,
      sourceMessage: message,
    });
  }

  // 7. EXPENSE HEAD / ALL EXPENSES REPORT
  const isExpense = /\b(expense|expenses|kharcha|akhrajat|electricity|fuel|petrol|repair|maintenance)\b/i.test(clean) || entities.category;
  if (isExpense) {
    return await handleExpenseLedgerPdf({
      category: entities.category,
      allCategories: entities.allCategories,
      user,
      sourceMessage: message,
    });
  }

  // 8. ALL TRANSACTIONS / VOUCHER REPORT
  const isTransactions = /\b(all\s*transactions?|transaction\s*report|vouchers?\s*report|all\s*vouchers?|journal)\b/i.test(clean);
  if (isTransactions) {
    return await handleAllTransactionsPdf({ period, monthYearStr, monthLabel, user, sourceMessage: message });
  }

  // 9. If account keyword mentioned but no specific account was matched
  if (/\b(bank|account|cash|ledger)\b/i.test(clean)) {
    const accounts = await Account.find({ isActive: true }).select('name type').limit(10).lean();
    return {
      isClarification: true,
      message: 'Please specify which account ledger you would like in PDF format (e.g. "Give me Bank Al Falah ledger in PDF" or "Sabir Cash Hand ledger in PDF").\n\n' +
        '**Available Accounts:**\n' +
        accounts.map(a => `- ${a.name} (${a.type})`).join('\n'),
    };
  }

  // 10. If salary keyword mentioned without naming an employee
  if (isSalary) {
    const staff = await Employee.find({ employmentStatus: 'ACTIVE' }).select('name designation').limit(10).lean();
    return {
      isClarification: true,
      message: 'Please specify the employee for the salary ledger PDF (e.g. "Give me Rizwan Ullah\'s salary ledger in PDF").\n\n' +
        '**Active Employees:**\n' +
        staff.map(s => `- ${s.name} (${s.designation || 'Staff'})`).join('\n'),
    };
  }

  // Fallback clarification
  return {
    isClarification: true,
    message: 'Please specify which PDF report you need. Supported PDF reports include:\n\n' +
      '- **Bank / Cash Account Ledgers** (e.g. *"Bank Al Falah ledger in PDF"*)\n' +
      '- **Employee Salary Ledgers** (e.g. *"Rizwan Ullah salary ledger in PDF"*)\n' +
      '- **Employee Loan Ledgers** (e.g. *"Sabir loan ledger in PDF"*)\n' +
      '- **Attendance Reports** (e.g. *"Attendance report for all employees in PDF"*)\n' +
      '- **Property Expense Reports** (e.g. *"Commercial Plaza expenses in PDF"*)\n' +
      '- **Consolidated Expense Reports** (e.g. *"Monthly expense report in PDF"*)\n' +
      '- **Profit & Loss Statements** (e.g. *"Profit & Loss report for October 2026 in PDF"*)\n' +
      '- **Transaction & Voucher Ledgers** (e.g. *"Complete transaction report in PDF"*)',
  };
}

/**
 * Handle Bank & Cash Account Ledger PDF
 */
async function handleAccountLedgerPdf({ account, monthYearStr, monthLabel, user, sourceMessage }) {
  const queryParams = {
    type: account.type === 'CASH' ? 'CASH' : 'BANK',
    entityId: String(account._id),
    datePreset: monthYearStr ? 'CUSTOM' : 'ALL',
  };

  if (monthYearStr) {
    const [y, m] = monthYearStr.split('-').map(Number);
    const { startDate, endDate } = getUtcMonthDateRange(y, m);
    queryParams.startDate = startDate.toISOString().slice(0, 10);
    queryParams.endDate = endDate.toISOString().slice(0, 10);
  }

  const payload = await reportGenerators.getLedgerReportData(queryParams);
  const pdfBuffer = await reportGenerators.generateLedgerPDF(payload, user);

  const safeName = account.name.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const fileName = `${safeName}_Account_Ledger.pdf`;
  const title = `${account.name} – Account Ledger`;

  const downloadToken = storePdfReport({
    buffer: pdfBuffer,
    fileName,
    title,
    user,
    sourceMessage,
  });

  const { openingBalance, totalDebit, totalCredit, closingBalance, entryCount } = payload.summary;

  const textSummary = `### 📄 ${account.name} — Account Ledger\n\n` +
    `- **Account Type**: ${account.type}\n` +
    `- **Reporting Period**: ${payload.datePreset || monthLabel || 'All Time'}\n` +
    `- **Opening Balance**: PKR ${Number(openingBalance || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Total Credits (Deposits / In)**: PKR ${Number(totalCredit || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Total Debits (Withdrawals / Out)**: PKR ${Number(totalDebit || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Closing Balance**: PKR ${Number(closingBalance || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Recorded Entries**: ${entryCount || 0} transactions\n\n` +
    `Your official branded PDF ledger has been generated with complete transaction details, dates, and voucher IDs.`;

  return {
    success: true,
    message: textSummary,
    pdfReport: {
      downloadUrl: `/api/ai/download-report/${downloadToken}`,
      fileName,
      title,
      fileSize: formatFileSize(pdfBuffer.length),
      reportType: 'ACCOUNT_LEDGER',
      period: payload.datePreset || monthLabel || 'All Time',
    },
  };
}

/**
 * Handle Employee Salary Ledger PDF
 */
async function handleSalaryLedgerPdf({ employee, user, sourceMessage }) {
  let responseBody = null;
  const mockRes = {
    status() { return this; },
    json(body) { responseBody = body; return body; },
  };

  await reportGenerators.readPayrollEmployeeLedger({ params: { employeeId: String(employee._id) } }, mockRes);

  if (!responseBody?.success || !responseBody.data) {
    throw new Error(responseBody?.message || 'Could not retrieve employee salary ledger.');
  }

  const data = responseBody.data;
  const rawLedger = Array.isArray(data.ledger) ? data.ledger : [];

  let running = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  const entries = rawLedger.map((entry) => {
    const accrued = round2(entry.accruedAmount || 0);
    const paid = round2(entry.paidAmount || 0);
    running = round2(running + accrued - paid);
    totalCredit += accrued;
    totalDebit += paid;

    return {
      date: entry.date ? new Date(entry.date) : new Date(),
      voucherNo: entry.voucherNo || `SAL-${entry.month || 'REC'}`,
      detail: entry.detail || `Salary: ${entry.month || ''} (${entry.type})`,
      categoryName: 'Salary',
      drAccount: paid > 0 ? (entry.payingAccount || 'Bank / Cash') : 'Payroll Accrual',
      crAccount: paid > 0 ? 'Salary Expense' : 'Employee Payable',
      debit: paid,
      credit: accrued,
      amount: accrued || paid,
      balance: running,
      status: 'VERIFIED',
      createdBy: 'Payroll System',
    };
  });

  const ledgerPayload = {
    type: 'SALARY',
    ledgerTitle: `Salary Ledger: ${employee.name}`,
    entitySubtext: `Designation: ${employee.designation || 'Staff'} • Basic Salary: PKR ${Number(employee.basicSalary || 0).toLocaleString('en-PK')}`,
    datePreset: 'All Time (Full Payroll History)',
    isLiquidityLedger: false,
    summary: {
      openingBalance: 0,
      totalDebit: round2(totalDebit),
      totalCredit: round2(totalCredit),
      closingBalance: round2(running),
      entryCount: entries.length,
    },
    entries,
  };

  const pdfBuffer = await reportGenerators.generateLedgerPDF(ledgerPayload, user);
  const safeName = employee.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Salary_Ledger_${safeName}.pdf`;
  const title = `${employee.name} – Complete Salary Ledger`;

  const downloadToken = storePdfReport({
    buffer: pdfBuffer,
    fileName,
    title,
    user,
    sourceMessage,
  });

  const textSummary = `### 📄 ${employee.name} — Complete Salary Ledger\n\n` +
    `- **Designation**: ${employee.designation || 'Staff'}\n` +
    `- **Total Salary Accrued**: PKR ${totalCredit.toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Total Salary Paid / Disbursed**: PKR ${totalDebit.toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Outstanding / Pending Balance**: PKR ${running.toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Recorded Salary Vouchers**: ${entries.length} records\n\n` +
    `Your official branded salary ledger PDF is ready for download.`;

  return {
    success: true,
    message: textSummary,
    pdfReport: {
      downloadUrl: `/api/ai/download-report/${downloadToken}`,
      fileName,
      title,
      fileSize: formatFileSize(pdfBuffer.length),
      reportType: 'SALARY_LEDGER',
      period: 'Full Payroll History',
    },
  };
}

/**
 * Handle Employee Loan Ledger PDF
 */
async function handleLoanLedgerPdf({ employee, user, sourceMessage }) {
  const loans = await StaffLoan.find({ employeeId: employee._id })
    .sort({ date: 1, createdAt: 1, _id: 1 })
    .lean();

  let running = 0;
  let totalDisbursed = 0;
  let totalRepaid = 0;

  const entries = loans.map((l) => {
    const isDisbursal = l.type ? l.type === 'DISBURSEMENT' : true;
    const amount = round2(l.amount || l.loanAmount || 0);

    if (isDisbursal) {
      running = round2(running + amount);
      totalDisbursed += amount;
    } else {
      running = round2(running - amount);
      totalRepaid += amount;
    }

    return {
      date: l.date || l.loanDate ? new Date(l.date || l.loanDate) : new Date(),
      voucherNo: l.voucherNo || (l._id ? `LOAN-${l._id.toString().slice(-6)}` : `LOAN-${running}`),
      detail: l.description || l.reason || (isDisbursal ? 'Loan Disbursement / Advance' : 'Loan Repayment / Salary Deduction'),
      categoryName: 'Staff Loan',
      drAccount: isDisbursal ? `${employee.name} (Loan Advance)` : 'Repayment Account',
      crAccount: isDisbursal ? 'Cash / Bank' : `${employee.name} (Loan Advance)`,
      debit: isDisbursal ? amount : 0,
      credit: !isDisbursal ? amount : 0,
      amount,
      balance: running,
      status: 'POSTED',
      createdBy: 'System',
    };
  });

  const ledgerPayload = {
    type: 'LOAN',
    ledgerTitle: `Staff Loan Ledger: ${employee.name}`,
    entitySubtext: `Designation: ${employee.designation || 'Staff'} • Active Loan Balance: PKR ${running.toLocaleString('en-PK')}`,
    datePreset: 'Complete Loan History',
    isLiquidityLedger: false,
    summary: {
      openingBalance: 0,
      totalDebit: round2(totalDisbursed),
      totalCredit: round2(totalRepaid),
      closingBalance: round2(running),
      entryCount: entries.length,
    },
    entries,
  };

  const pdfBuffer = await reportGenerators.generateLedgerPDF(ledgerPayload, user);
  const safeName = employee.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Loan_Ledger_${safeName}.pdf`;
  const title = `${employee.name} – Loan Ledger`;

  const downloadToken = storePdfReport({
    buffer: pdfBuffer,
    fileName,
    title,
    user,
    sourceMessage,
  });

  const textSummary = `### 📄 ${employee.name} — Staff Loan Ledger\n\n` +
    `- **Designation**: ${employee.designation || 'Staff'}\n` +
    `- **Total Loan Disbursed / Advanced**: PKR ${totalDisbursed.toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Total Loan Repaid / Deducted**: PKR ${totalRepaid.toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Current Outstanding Loan Balance**: PKR ${running.toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Total Entries**: ${entries.length} loan records\n\n` +
    `Your official branded loan statement PDF is ready for download.`;

  return {
    success: true,
    message: textSummary,
    pdfReport: {
      downloadUrl: `/api/ai/download-report/${downloadToken}`,
      fileName,
      title,
      fileSize: formatFileSize(pdfBuffer.length),
      reportType: 'LOAN_LEDGER',
      period: 'Complete Loan History',
    },
  };
}

/**
 * Handle Property & Unit Expense / Cash Flow PDF
 */
async function handlePropertyLedgerPdf({ property, unit, user, sourceMessage }) {
  const queryParams = {
    type: 'PROPERTY',
    entityId: String(property._id),
    datePreset: 'ALL',
  };
  if (unit) {
    queryParams.unitId = String(unit._id);
  }

  const payload = await reportGenerators.getLedgerReportData(queryParams);
  const pdfBuffer = await reportGenerators.generateLedgerPDF(payload, user);

  const propName = property.plazaName || property.propertyName || 'Property';
  const safeName = propName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeName}_Expenses_Ledger.pdf`;
  const title = `${propName} – Property Expenses & Financial Ledger`;

  const downloadToken = storePdfReport({
    buffer: pdfBuffer,
    fileName,
    title,
    user,
    sourceMessage,
  });

  const { totalDebit, totalCredit, closingBalance, entryCount } = payload.summary;

  const textSummary = `### 📄 ${payload.ledgerTitle}\n\n` +
    `- **Property Code**: ${property.propertyCode || 'N/A'}\n` +
    `- **Total Outflow / Expenses**: PKR ${Number(totalDebit || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Total Inflow / Rent Realization**: PKR ${Number(totalCredit || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Net Cash Flow**: PKR ${Number(closingBalance || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Transactions Recorded**: ${entryCount || 0} entries\n\n` +
    `Official property ledger PDF generated with complete voucher IDs, classifications, and accounts.`;

  return {
    success: true,
    message: textSummary,
    pdfReport: {
      downloadUrl: `/api/ai/download-report/${downloadToken}`,
      fileName,
      title,
      fileSize: formatFileSize(pdfBuffer.length),
      reportType: 'PROPERTY_REPORT',
      period: 'All Time (Full History)',
    },
  };
}

/**
 * Handle Head-wise or Consolidated Expenses PDF
 */
async function handleExpenseLedgerPdf({ category, allCategories, user, sourceMessage }) {
  const queryParams = {
    type: 'EXPENSE',
    entityId: category ? String(category._id) : 'ALL_EXPENSES',
    datePreset: 'ALL',
  };

  const payload = await reportGenerators.getLedgerReportData(queryParams);
  const pdfBuffer = await reportGenerators.generateLedgerPDF(payload, user);

  const headName = category ? category.name : 'Consolidated_Expenses';
  const safeName = headName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `${safeName}_Expense_Report.pdf`;
  const title = category ? `${category.name} – Expense Ledger` : 'Consolidated Business Expenses Ledger';

  const downloadToken = storePdfReport({
    buffer: pdfBuffer,
    fileName,
    title,
    user,
    sourceMessage,
  });

  const { totalDebit, entryCount } = payload.summary;

  const textSummary = `### 📄 ${payload.ledgerTitle}\n\n` +
    `- **Expense Category**: ${category ? category.name : 'All Business & Operational Heads'}\n` +
    `- **Total Expenses**: PKR ${Number(totalDebit || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n` +
    `- **Total Vouchers Count**: ${entryCount || 0} expense entries\n\n` +
    `Official expense report PDF generated with itemized voucher IDs, properties, and payment accounts.`;

  return {
    success: true,
    message: textSummary,
    pdfReport: {
      downloadUrl: `/api/ai/download-report/${downloadToken}`,
      fileName,
      title,
      fileSize: formatFileSize(pdfBuffer.length),
      reportType: 'EXPENSE_REPORT',
      period: 'All Time (Full History)',
    },
  };
}

/**
 * Handle Profit & Loss / Monthly Funds PDF
 */
async function handleProfitLossPdf({ monthYearStr, monthLabel, user, sourceMessage }) {
  const pdfBuffer = await reportGenerators.generateMonthlyFundsReport(monthYearStr);

  const fileName = `Monthly_Funds_Report_${monthYearStr}.pdf`;
  const title = `PIXX Technologies – Profit & Loss and Funds Management (${monthLabel})`;

  const downloadToken = storePdfReport({
    buffer: pdfBuffer,
    fileName,
    title,
    user,
    sourceMessage,
  });

  const textSummary = `### 📄 Profit & Loss & Monthly Funds Management Report (${monthLabel})\n\n` +
    `Generated official multi-section executive PDF report for **${monthLabel}**:\n` +
    `- **Section 1**: Executive Cash Flow & Liquidity (Available Funds, Incomes, Net Expenses, Closing Position)\n` +
    `- **Section 2**: Property-wise Rental Income & Arrears Realization\n` +
    `- **Section 3**: Head-wise Operational Expenses (Property, General, & Salaries)\n` +
    `- **Section 4**: Complete Bank & Cash Accounts Liquidity Statements\n\n` +
    `Your official high-resolution PDF report with executive signatures is ready for download.`;

  return {
    success: true,
    message: textSummary,
    pdfReport: {
      downloadUrl: `/api/ai/download-report/${downloadToken}`,
      fileName,
      title,
      fileSize: formatFileSize(pdfBuffer.length),
      reportType: 'PROFIT_LOSS',
      period: monthLabel,
    },
  };
}

/**
 * Handle All Transactions & Vouchers Report PDF
 */
async function handleAllTransactionsPdf({ period, monthYearStr, monthLabel, user, sourceMessage }) {
  const { startDate, endDate } = getUtcMonthDateRange(period.year, period.month);

  const transactions = await Transaction.find({
    date: { $gte: startDate, $lte: endDate },
    status: { $nin: ['REVERSED', 'VOID'] },
  })
    .sort({ date: 1, voucherNo: 1 })
    .populate('drAccountId', 'name type')
    .populate('crAccountId', 'name type')
    .populate('propertyId', 'plazaName propertyName propertyCode')
    .populate('categoryId', 'name parentCategoryId')
    .lean();

  const totalAmount = round2(transactions.reduce((sum, t) => sum + (t.amount || 0), 0));

  const pdfBuffer = await reportGenerators.generateAllTransactionsPDF(
    {
      transactions,
      period: monthLabel,
      totalAmount,
      transactionCount: transactions.length,
    },
    user
  );

  const fileName = `All_Transactions_${monthYearStr}.pdf`;
  const title = `Central Transactions Ledger – ${monthLabel}`;

  const downloadToken = storePdfReport({
    buffer: pdfBuffer,
    fileName,
    title,
    user,
    sourceMessage,
  });

  const textSummary = `### 📄 Central Transactions & Voucher Ledger (${monthLabel})\n\n` +
    `- **Reporting Period**: ${monthLabel}\n` +
    `- **Total Verified Transactions**: ${transactions.length} entries\n` +
    `- **Total Volume**: PKR ${totalAmount.toLocaleString('en-PK', { minimumFractionDigits: 2 })}\n\n` +
    `Official landscape transaction register PDF with voucher numbers, debit/credit accounts, and classifications.`;

  return {
    success: true,
    message: textSummary,
    pdfReport: {
      downloadUrl: `/api/ai/download-report/${downloadToken}`,
      fileName,
      title,
      fileSize: formatFileSize(pdfBuffer.length),
      reportType: 'TRANSACTION_REPORT',
      period: monthLabel,
    },
  };
}

/**
 * Handle Attendance Report PDF
 */
async function handleAttendancePdf({ entities, period, monthYearStr, monthLabel, user, sourceMessage }) {
  const { startDate, endDate } = getUtcMonthDateRange(period.year, period.month);

  const filter = {
    date: { $gte: startDate, $lte: endDate },
  };

  if (entities.employee) {
    filter.employeeId = entities.employee._id;
  }

  const records = await Attendance.find(filter)
    .sort({ date: 1 })
    .populate('employeeId', 'name designation department')
    .lean();

  const stats = {
    present: records.filter(r => r.status === 'PRESENT').length,
    late: records.filter(r => r.status === 'LATE').length,
    absent: records.filter(r => r.status === 'ABSENT').length,
    halfDay: records.filter(r => r.status === 'HALF_DAY').length,
    leave: records.filter(r => r.status === 'LEAVE').length,
    total: records.length,
  };

  const empTitle = entities.employee ? entities.employee.name : 'All Registered Employees';

  const entries = records.map((r) => ({
    date: r.date ? new Date(r.date) : new Date(),
    voucherNo: r.dateStr || 'ATT',
    detail: `${r.employeeId?.name || 'Staff'}${r.arrivalTime ? ` (Arrival: ${r.arrivalTime})` : ''}${r.remarks ? ` - ${r.remarks}` : ''}`,
    categoryName: r.status,
    drAccount: r.employeeId?.name || 'Employee',
    crAccount: r.status,
    debit: r.lateMinutes || 0,
    credit: 0,
    amount: r.lateMinutes || 0,
    balance: 0,
    status: r.status,
    createdBy: 'Attendance System',
  }));

  const ledgerPayload = {
    type: 'ATTENDANCE',
    ledgerTitle: `Staff Attendance Register: ${empTitle}`,
    entitySubtext: `Period: ${monthLabel} • Present: ${stats.present} • Late: ${stats.late} • Absent: ${stats.absent} • Leave: ${stats.leave}`,
    datePreset: monthLabel,
    isLiquidityLedger: false,
    summary: {
      openingBalance: 0,
      totalDebit: stats.late,
      totalCredit: stats.present,
      closingBalance: stats.absent,
      entryCount: entries.length,
    },
    entries,
  };

  const pdfBuffer = await reportGenerators.generateLedgerPDF(ledgerPayload, user);
  const safeName = empTitle.replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Attendance_Report_${safeName}_${monthYearStr}.pdf`;
  const title = `Staff Attendance Report – ${empTitle} (${monthLabel})`;

  const downloadToken = storePdfReport({
    buffer: pdfBuffer,
    fileName,
    title,
    user,
    sourceMessage,
  });

  const textSummary = `### 📄 Staff Attendance Report (${empTitle} – ${monthLabel})\n\n` +
    `- **Period**: ${monthLabel}\n` +
    `- **Total Recorded Days**: ${stats.total}\n` +
    `- **Present**: ${stats.present} days\n` +
    `- **Late Arrivals**: ${stats.late} days\n` +
    `- **Absences**: ${stats.absent} days\n` +
    `- **Approved Leaves**: ${stats.leave} days\n\n` +
    `Official attendance register PDF with date stamps, arrival timings, and status summary.`;

  return {
    success: true,
    message: textSummary,
    pdfReport: {
      downloadUrl: `/api/ai/download-report/${downloadToken}`,
      fileName,
      title,
      fileSize: formatFileSize(pdfBuffer.length),
      reportType: 'ATTENDANCE_REPORT',
      period: monthLabel,
    },
  };
}
