import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import handlebars from 'handlebars';
import JSZip from 'jszip';

import Transaction from '../models/Transaction.js';
import Property from '../models/Property.js';
import Account from '../models/Account.js';
import Category from '../models/Category.js';
import MonthlyReport from '../models/MonthlyReport.js';
import RentalAgreement from '../models/RentalAgreement.js';
import {
  getMonthlyOpeningClosingMatrix,
  getHeadWiseExpenseReport,
  getAccountRunningLedger,
  resolveTransactionAccountDisplay,
  buildHeadWiseReportItems,
  round2,
} from './ledgerService.js';
import { getAgreedMonthlyRent } from './rentPricing.js';
import { getUtcMonthDateRange, getUtcMonthEndDate } from './salaryReportingService.js';
import { isOwnerPersonalTransaction } from './expenseClassificationService.js';
import {
  getBankStatementHeading,
  getLiquidityStatementAmounts,
} from './ledgerPresentation.js';
import { getRentalSummaryWithCarryForward } from './rentalCarryForwardService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------------------------------------
// Handlebars Formatting Helpers
// ----------------------------------------------------
const formatPKR = (val) => {
  if (val === undefined || val === null || isNaN(val) || val === '') return '-';
  const num = Number(val);
  if (num === 0) return '-';
  const isNeg = num < 0;
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(num));
  return isNeg ? `(${formatted})` : formatted;
};

const formatPKRZero = (val) => {
  if (val === undefined || val === null || isNaN(val)) return '0.00';
  const num = Number(val);
  const isNeg = num < 0;
  const formatted = new Intl.NumberFormat('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(num));
  return isNeg ? `(${formatted})` : formatted;
};

const formatInt = (val) => {
  if (val === undefined || val === null || isNaN(val) || val === 0) return '-';
  const num = Math.round(Number(val));
  const isNeg = num < 0;
  const formatted = new Intl.NumberFormat('en-PK').format(Math.abs(num));
  return isNeg ? `(${formatted})` : formatted;
};

const formatReportDate = (date) => {
  if (!date) return '-';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = monthNames[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
};

const formatShortDate = (date) => {
  if (!date) return '-';
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
};

// Register helpers
handlebars.registerHelper('formatPKR', formatPKR);
handlebars.registerHelper('formatPKRZero', formatPKRZero);
handlebars.registerHelper('formatInt', formatInt);
handlebars.registerHelper('formatReportDate', formatReportDate);
handlebars.registerHelper('formatShortDate', formatShortDate);
handlebars.registerHelper('isNegative', (val) => Number(val) < 0);
handlebars.registerHelper('isEven', (index) => index % 2 === 0);
handlebars.registerHelper('addOne', (val) => Number(val) + 1);
handlebars.registerHelper('gtZero', (val) => Number(val) > 0);
handlebars.registerHelper('eq', (a, b) => a === b);
handlebars.registerHelper('statusColor', (status) => {
  const map = { POSTED: '#047857', VERIFIED: '#1e40af', REVERSED: '#b91c1c', VOID: '#6b7280' };
  return map[status] || '#475569';
});


/**
 * Locate a valid browser executable (Edge, Chrome, or default Puppeteer Chromium)
 */
const getBrowserExecutablePath = () => {
  const commonPaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return undefined;
};

/**
 * Sort transactions by voucher number in sequential order:
 * 1. Target report month vouchers first (e.g. PT-001-09-26, PT-002-09-26...) strictly by sequence number
 * 2. Other PT vouchers (e.g. prior month adjustments) grouped by month and sequence
 * 3. Non-PT vouchers (e.g. TRF, Cheques) sorted naturally, then by date
 */
export const sortTransactionsByVoucher = (txs, targetMonthStr) => {
  return [...txs].sort((a, b) => {
    const vnA = (a.voucherNo || '').trim();
    const vnB = (b.voucherNo || '').trim();

    if (!vnA && !vnB) return (new Date(a.date) - new Date(b.date));
    if (!vnA) return 1;
    if (!vnB) return -1;

    const matchA = vnA.match(/^PT-(\d+)(?:-(\d{2})-(\d{2}))?$/i);
    const matchB = vnB.match(/^PT-(\d+)(?:-(\d{2})-(\d{2}))?$/i);

    if (matchA && matchB) {
      const numA = parseInt(matchA[1], 10);
      const numB = parseInt(matchB[1], 10);
      const monthCodeA = matchA[2] && matchA[3] ? `${matchA[2]}-${matchA[3]}` : null;
      const monthCodeB = matchB[2] && matchB[3] ? `${matchB[2]}-${matchB[3]}` : null;

      const isTargetA = monthCodeA === targetMonthStr;
      const isTargetB = monthCodeB === targetMonthStr;

      // Group 1: Vouchers matching the target report month (e.g. 09-26) come first
      if (isTargetA && !isTargetB) return -1;
      if (!isTargetA && isTargetB) return 1;

      // If both match target month, sort strictly by sequential number (PT-001, PT-002, PT-003...)
      if (isTargetA && isTargetB) {
        return numA - numB;
      }

      // If neither matches target month:
      // Group by month code, then by sequential number
      if (monthCodeA && monthCodeB) {
        if (monthCodeA !== monthCodeB) {
          return monthCodeA.localeCompare(monthCodeB);
        }
        return numA - numB;
      }

      if (monthCodeA && !monthCodeB) return -1;
      if (!monthCodeA && monthCodeB) return 1;

      return numA - numB;
    }

    // Standard PT vouchers come before non-PT vouchers
    if (matchA && !matchB) return -1;
    if (!matchA && matchB) return 1;

    // Fallback: natural alphanumeric sort, then date
    const cmp = vnA.localeCompare(vnB, undefined, { numeric: true, sensitivity: 'base' });
    if (cmp !== 0) return cmp;
    return new Date(a.date) - new Date(b.date);
  });
};

/**
 * Generates official multi-page PDF report matching the user's PDF report
 * @param {string} monthYear - Format 'YYYY-MM', e.g. '2026-08'
 * @returns {Promise<Buffer>} - Generated PDF binary buffer
 */
export const generateMonthlyFundsReport = async (monthYear) => {
  let year = 2026;
  let month = 8;

  if (monthYear && /^\d{4}-\d{2}$/.test(monthYear)) {
    const [y, m] = monthYear.split('-').map(Number);
    year = y;
    month = m;
  }

  const periodName = `${year}-${String(month).padStart(2, '0')}`;
  const { startDate, endDate } = getUtcMonthDateRange(year, month);
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[month - 1];
  const monthNameYear = `${monthName}-${year}`;
  const monthEndDate = getUtcMonthEndDate(year, month);
  const lastDay = monthEndDate.getUTCDate();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const asOfDate = `${lastDay}-${monthName}-${year}`;
  const shortAsOfDate = `${lastDay}-${String(month).padStart(2, '0')}-${year}`;
  const dayDateString = `${dayNames[monthEndDate.getUTCDay()]}, ${monthName} ${lastDay}, ${year}`;

  // Fetch report status and audit metadata if available
  const monthlyReport = await MonthlyReport.findOne({ month: periodName }).lean();

  // 1. Fetch Live Matrix & Macro Figures from Central Ledger (Pure Dynamic Data)
  const matrixData = await getMonthlyOpeningClosingMatrix(year, month);
  const { grandTotal, rows: matrixRows } = matrixData;

  // Query real transactions for income & expenses to compute authoritative macro figures
  // Query real transactions for income & expenses to compute authoritative macro figures
  const [rentTxs, rawOtherIncomeTxs, rawExpenseTxs] = await Promise.all([
    Transaction.find({
      date: { $gte: startDate, $lte: endDate },
      transactionType: 'INCOME',
      reportCategory: 'Rent',
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    }).lean(),
    Transaction.find({
      date: { $gte: startDate, $lte: endDate },
      transactionType: 'INCOME',
      reportCategory: { $in: ['Other Income', 'Owner Personal'] },
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    })
      .populate({ path: 'categoryId', select: 'name parentCategoryId', populate: { path: 'parentCategoryId', select: 'name' } })
      .lean(),
    Transaction.find({
      date: { $gte: startDate, $lte: endDate },
      transactionType: 'EXPENSE',
      $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
    })
      .populate({ path: 'categoryId', select: 'name parentCategoryId', populate: { path: 'parentCategoryId', select: 'name' } })
      .lean(),
  ]);

  // Exclude owner personal funds from Page 1 business figures
  const otherIncomeTxs = rawOtherIncomeTxs.filter((tx) => !isOwnerPersonalTransaction(tx));
  const expenseTxs = rawExpenseTxs.filter((tx) => !isOwnerPersonalTransaction(tx));

  const totalRentalIncomeReceived = round2(rentTxs.reduce((sum, t) => sum + (t.amount || 0), 0));
  const totalOtherReceipts = round2(otherIncomeTxs.reduce((sum, t) => sum + (t.amount || 0), 0));
  const totalAmountAvailable = round2(totalRentalIncomeReceived + totalOtherReceipts);
  const totalNetExpenses = round2(expenseTxs.reduce((sum, t) => sum + (t.amount || 0), 0));
  const expenseClassificationTotals = expenseTxs.reduce((totals, tx) => {
    const classification = tx.expenseClassification
      || (tx.unitId ? 'UNIT_EXPENSE' : tx.propertyId ? 'PROPERTY_OWN_EXPENSE' : 'GENERAL_EXPENSE');
    if (classification === 'GENERAL_EXPENSE') totals.generalExpenses += tx.amount || 0;
    if (classification === 'PROPERTY_OWN_EXPENSE') totals.propertyOwnExpenses += tx.amount || 0;
    if (classification === 'UNIT_EXPENSE') totals.unitExpenses += tx.amount || 0;
    return totals;
  }, { generalExpenses: 0, propertyOwnExpenses: 0, unitExpenses: 0 });
  Object.keys(expenseClassificationTotals).forEach((key) => {
    expenseClassificationTotals[key] = round2(expenseClassificationTotals[key]);
  });
  const closingAvailableBalance = round2(totalAmountAvailable - totalNetExpenses);

  // Part 21: Pre-generation Reconciliation Validation
  const calcBal = round2(grandTotal.openingBalance + grandTotal.totalInput - grandTotal.totalOutput);
  if (Math.abs(calcBal - grandTotal.closingBalance) > 0.05) {
    throw new Error(
      `Report Reconciliation Error: Opening Balance (${grandTotal.openingBalance}) + Input (${grandTotal.totalInput}) - Output (${grandTotal.totalOutput}) = ${calcBal}, which differs from Closing Balance (${grandTotal.closingBalance}).`
    );
  }

  const macro = {
    totalRentalIncomeReceived,
    totalOtherReceipts,
    totalAmountAvailable,
    totalNetExpenses,
    ...expenseClassificationTotals,
    closingAvailableBalance,
    netPosition: closingAvailableBalance,
  };

  // 2. Format Page 2: Cash & Bank Opening & Closing Balance Detail (Pure Dynamic from DB)
  const sortedRows = matrixRows.map((r) => ({
    name: r.accountName,
    openingBalance: r.openingBalance,
    rentalIncome: r.rentalIncome,
    otherInput: r.otherInput,
    totalInput: r.totalInput,
    rentalExpenses: r.rentalExpenses,
    otherExpenses: r.otherExpenses,
    totalOutput: r.totalOutput,
    closingBalance: r.closingBalance,
  }));

  const page2Matrix = {
    rows: sortedRows,
    totals: {
      openingBalance: grandTotal.openingBalance,
      rentalIncome: grandTotal.rentalIncome,
      otherInput: grandTotal.otherInput,
      totalInput: grandTotal.totalInput,
      rentalExpenses: grandTotal.rentalExpenses,
      otherExpenses: grandTotal.otherExpenses,
      totalOutput: grandTotal.totalOutput,
      closingBalance: grandTotal.closingBalance,
    },
  };

  // 3. Fetch Master Transactions for Journal (Pages 4 & 5)
  const rawTransactions = await Transaction.find({
    date: { $gte: startDate, $lte: endDate },
    $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
  })
    .populate({
      path: 'categoryId',
      select: 'name type isRentalHead parentCategoryId isMainHead',
      populate: { path: 'parentCategoryId', select: 'name' },
    })
    .populate('drAccountId', 'name type')
    .populate('crAccountId', 'name type')
    .populate('propertyId', 'plazaName units')
    .lean();

  const activeMonthCode = `${String(month).padStart(2, '0')}-${String(year).slice(-2)}`;
  const transactions = sortTransactionsByVoucher(rawTransactions, activeMonthCode);

  const masterJournalList = transactions.map(tx => {
    const isRent = tx.reportCategory === 'Rent' || tx.sourceModule === 'RENT_RECEIVED';
    const isTransfer = tx.transactionType === 'TRANSFER';

    let category = 'Payments';
    if (isRent) category = 'Rent';
    else if (isTransfer) category = 'Transfer';
    else if (tx.reportCategory) category = tx.reportCategory;

    const { dr, cr, head } = resolveTransactionAccountDisplay(tx);

    return {
      date: formatShortDate(tx.date),
      vn: tx.voucherNo,
      detail: tx.detail,
      head,
      category,
      dr,
      cr,
      amount: round2(tx.amount),
      expenseClassification: tx.expenseClassification
        || (tx.unitId ? 'UNIT_EXPENSE' : tx.propertyId ? 'PROPERTY_OWN_EXPENSE' : 'GENERAL_EXPENSE'),
    };
  });

  const totalJournalAmount = round2(
    masterJournalList.reduce((sum, v) => sum + v.amount, 0)
  );

  const masterJournal = {
    vouchers: masterJournalList,
    totalAmount: totalJournalAmount,
  };

  // 4. Fetch Head-Wise Expenses (Pages 6, 7 & 8)
  const headWise = await getHeadWiseExpenseReport(year, month);
  const headWiseGroups = headWise.mainHeads
    .filter((head) => head.totalSpent > 0)
    .map((head) => ({
      headName: head.mainHeadName,
      totalAmount: head.totalSpent,
      items: buildHeadWiseReportItems(head),
    }));

  const headWiseReport = {
    groups: headWiseGroups,
    grandTotal: headWise.totalExpensesOverall,
  };

  // 5. Fetch 7 Plazas Tenancy Summary (Page 3)
  const [repYear, repMonth] = periodName.split('-').map(Number);
  const currentMonthLabel = `${monthNames[repMonth - 1]}-${repYear}`;
  const prevDate = new Date(Date.UTC(repYear, repMonth - 2, 1));
  const priorMonthLabel = `${monthNames[prevDate.getUTCMonth()]}-${prevDate.getUTCFullYear()}`;

  const rentalSummary = await getRentalSummaryWithCarryForward(periodName);

  const plazaList = rentalSummary.plazas.map((plaza) => {
    const units = (plaza.units || []).map((u) => {
      const prior = round2(u.priorMonthReceivable || 0);
      return {
        unitName: `${u.unitName}${u.tenantName && u.tenantName !== 'Unassigned' ? ` - ${u.tenantName}` : ''}`,
        dueDay: u.dueDay,
        agreedRent: u.agreedRent,
        priorReceivable: prior,
        julyReceivable: prior,
        isPriorNeg: prior < 0,
        currentActualRent: u.currentMonthActualRent,
        augustActualRent: u.currentMonthActualRent,
        receivedAmount: u.receivedAmount,
        receivedDate: u.receivedDate,
        receivingBank: u.receivingAccountName || '-',
        renewalDate: u.renewalDate,
        receivable: u.outstandingReceivable,
        advanceRent: u.advanceRentReceived,
      };
    });

    return { plazaName: plaza.plazaName, units };
  });

  const page3Tenancy = {
    priorMonthLabel,
    currentMonthLabel,
    plazas: plazaList,
    totals: {
      agreedRent: rentalSummary.grandTotals.totalAgreedRent,
      priorReceivable: rentalSummary.grandTotals.totalPriorReceivable,
      julyReceivable: rentalSummary.grandTotals.totalPriorReceivable,
      isPriorNeg: rentalSummary.grandTotals.totalPriorReceivable < 0,
      currentActualRent: rentalSummary.grandTotals.totalCurrentDue,
      augustActualRent: rentalSummary.grandTotals.totalCurrentDue,
      receivedAmount: rentalSummary.grandTotals.totalReceivedAmount,
      receivable: rentalSummary.grandTotals.totalOutstandingReceivable,
      advanceRent: rentalSummary.grandTotals.totalAdvanceRentReceived,
    },
  };

  // 6. Fetch Individual Account Statements (Pages 9+)
  const liquidityAccounts = await Account.find({ isActive: true, isClearing: { $ne: true } })
    .sort({ type: 1, name: 1 })
    .lean();

  const accountStatements = [];
  for (const acc of liquidityAccounts) {
    const statement = await getAccountRunningLedger(acc._id, startDate, endDate);
    const isCash = acc.type === 'CASH';

    const { title: bankOrCashTitle, subtitle: accountSubtitle } =
      getBankStatementHeading(acc.name, acc.type);

    const entries = statement.entries.map((e) => {
      const amounts = getLiquidityStatementAmounts(e, acc.name);
      return {
        date: formatReportDate(e.date),
        vn: e.voucherNo || '-',
        detail: e.detail,
        drAccount: isCash ? amounts.debitAccount : '',
        crAccount: isCash ? amounts.creditAccount : '',
        debit: amounts.debit,
        credit: amounts.credit,
        balance: e.runningBalance,
        isNeg: e.runningBalance < 0,
      };
    });

    const priorDayDate = new Date(startDate.getTime() - 86400000);
    const priorDateStr = `${String(priorDayDate.getUTCDate()).padStart(2, '0')}-${String(priorDayDate.getUTCMonth() + 1).padStart(2, '0')}-${String(priorDayDate.getUTCFullYear()).slice(-2)}`;

    accountStatements.push({
      bankOrCashTitle,
      accountSubtitle,
      accountNumber: acc.accountNumber,
      isCashCustodian: isCash,
      priorDate: priorDateStr,
      openingBalance: statement.previousBalance,
      entries,
      totalDr: statement.totalCredits,
      totalCr: statement.totalDebits,
      closingBalance: statement.closingBalance,
      isClosingNeg: statement.closingBalance < 0,
    });
  }

  // 7. Compile Handlebars Template
  const templatePath = path.join(__dirname, '..', 'templates', 'fundsReportTemplate.html');
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const compiledTemplate = handlebars.compile(templateSource);

  const htmlContent = compiledTemplate({
    periodName,
    asOfDate,
    shortAsOfDate,
    monthNameYear,
    dayDateString,
    macro,
    page2Matrix,
    page3Tenancy,
    masterJournal,
    headWiseReport,
    accountStatements,
    reportStatus: monthlyReport?.status || 'DRAFT',
    isPublished: monthlyReport?.status === 'PUBLISHED',
    dataEnteredByName: 'Sarfraz Khan (Accountant - Data Entry)',
    checkedByName: 'Khurshid Anwar',
    preparedByName: 'Pixx Tech Expense Tracker System',
    publishedByName: monthlyReport?.publishedByName || '',
    generatedDate: formatReportDate(new Date()),
  });

  // 8. Launch Puppeteer with fallback
  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;

  const localExecutablePath = getBrowserExecutablePath();
  const executablePath = localExecutablePath || await chromium.executablePath();
  const launchOptions = {
    headless: true,
    args: localExecutablePath ? [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ] : chromium.args,
    executablePath,
  };

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '12mm',
        left: '10mm',
      },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="font-family: Arial, sans-serif; font-size: 7pt; width: 100%; display: flex; justify-content: space-between; padding: 0 10mm; color: #4b5563;">
          <span>Pixx Technologies &bull; Monthly Funds Management Report (${periodName})</span>
          <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
        </div>
      `,
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
};

const getImageBase64 = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      const fileBuffer = fs.readFileSync(filePath);
      return `data:image/png;base64,${fileBuffer.toString('base64')}`;
    }
  } catch (err) {
    console.error('Failed to load image for PDF:', filePath, err.message);
  }
  return '';
};

const frontendAssetPath = path.join(__dirname, '..', '..', 'Frontend', 'src', 'assets', 'image');
const logoBase64 = getImageBase64(path.join(frontendAssetPath, 'logo.png'));
const sarfrazSignBase64 = getImageBase64(path.join(frontendAssetPath, 'sarfrazsign.png'));
const khurshidSignBase64 = getImageBase64(path.join(frontendAssetPath, 'khurshidsign.png'));

/**
 * Generate A4 Single Voucher PDF Buffer
 */
export const generateSingleVoucherPDF = async (printDetail) => {
  const templatePath = path.join(__dirname, '..', 'templates', 'singleVoucherTemplate.html');
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const compiledTemplate = handlebars.compile(templateSource);

  const isVerified = printDetail.status !== 'PENDING' && printDetail.status !== 'PENDING_VERIFICATION';
  const isRent = printDetail.reportCategory === 'Rent' || printDetail.sourceModule === 'RENT_RECEIVED';
  const isTransfer = printDetail.transactionType === 'TRANSFER';
  const isOtherIncome =
    printDetail.reportCategory === 'Other Income' ||
    printDetail.sourceModule === 'OTHER_INCOME';

  let expenseClassificationLabel = '';
  if (!isRent && !isTransfer && !isOtherIncome) {
    if (printDetail.expenseClassification === 'UNIT_EXPENSE') {
      expenseClassificationLabel = 'Unit Expense';
    } else if (printDetail.expenseClassification === 'PROPERTY_OWN_EXPENSE') {
      expenseClassificationLabel = 'Property Own Expense';
    } else {
      expenseClassificationLabel = 'General Expense';
    }
  }
  const propName = printDetail.property?.name || '';
  const unitName = printDetail.unit?.name || '';
  const locationName = [propName, unitName].filter(Boolean).join(' - ');
  const categoryTitle = printDetail.category?.name || (isRent ? 'Rental Income' : (isTransfer ? 'Internal Transfer' : 'General'));
  const mainExpenseHeadTitle = printDetail.category?.isMainHead
    ? printDetail.category.name
    : printDetail.category?.parentCategoryId?.name || categoryTitle;

  let drAccount = { ...(printDetail.drAccount || { name: '-' }) };
  let crAccount = { ...(printDetail.crAccount || { name: '-' }) };

  if (isRent) {
    if (!drAccount.name || drAccount.name === '-' || /Clearing|External Parties/i.test(drAccount.name)) {
      drAccount.name = 'Cash Custodian / Bank';
    }
    crAccount.name = locationName || 'Rental Income';
  } else if (isOtherIncome) {
    if (!drAccount.name || drAccount.name === '-' || /Clearing|External Parties/i.test(drAccount.name)) {
      drAccount.name = 'Receiving Account (Bank/Cash)';
    }
    crAccount.name = categoryTitle || 'Other Income';
  } else if (isTransfer) {
    if (!drAccount.name || drAccount.name === '-' || /Clearing|External Parties/i.test(drAccount.name)) {
      drAccount.name = 'Destination Account';
    }
    if (!crAccount.name || crAccount.name === '-' || /Clearing|External Parties/i.test(crAccount.name)) {
      crAccount.name = 'Source Account';
    }
  } else {
    // Expense
    if (!drAccount.name || drAccount.name === '-' || /Clearing|External Parties/i.test(drAccount.name)) {
      drAccount.name = mainExpenseHeadTitle;
    }
    if (!crAccount.name || crAccount.name === '-' || /Clearing|External Parties/i.test(crAccount.name)) {
      crAccount.name = 'Payment Account (Bank/Cash)';
    }
  }

  const htmlContent = compiledTemplate({
    ...printDetail,
    formattedDate: formatReportDate(printDetail.date),
    isVerified,
    isRent,
    expenseClassificationLabel,
    actionLabel: isRent || isOtherIncome ? 'RECEIVED' : 'PAID',
    category: { name: categoryTitle },
    drAccount,
    crAccount,
    logoBase64,
    sarfrazSignBase64,
    khurshidSignBase64,
    generatedDate: new Date().toLocaleString('en-GB'),
  });

  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;

  const localExecutablePath = getBrowserExecutablePath();
  const executablePath = localExecutablePath || (await chromium.executablePath());
  const launchOptions = {
    headless: true,
    args: localExecutablePath
      ? [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ]
      : chromium.args,
    executablePath,
  };

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '8mm',
        right: '8mm',
        bottom: '8mm',
        left: '8mm',
      },
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
};

/**
 * Generate A4 Receipt Evidence Slip PDF Buffer
 * Shows top voucher/entry metadata (date, voucher no, submitter, property, accounts, amount, narration)
 * with the attached purchase/receipt image(s) prominently positioned below.
 */
export const generateReceiptEvidencePDF = async (evidenceData) => {
  const templatePath = path.join(__dirname, '..', 'templates', 'receiptEvidenceTemplate.html');
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const compiledTemplate = handlebars.compile(templateSource);

  const htmlContent = compiledTemplate({
    ...evidenceData,
    formattedDate: formatReportDate(evidenceData.date),
    logoBase64,
    sarfrazSignBase64,
    khurshidSignBase64,
    generatedDate: new Date().toLocaleString('en-GB'),
  });

  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;

  const localExecutablePath = getBrowserExecutablePath();
  const executablePath = localExecutablePath || (await chromium.executablePath());
  const launchOptions = {
    headless: true,
    args: localExecutablePath
      ? [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ]
      : chromium.args,
    executablePath,
  };

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 30000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      pageRanges: '1',
      margin: {
        top: '4mm',
        right: '6mm',
        bottom: '4mm',
        left: '6mm',
      },
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
};

/**
  * Generate A4 Individual Account / Head Ledger Statement PDF Buffer
  */
export const generateLedgerPDF = async (ledgerData, requestedUser) => {
  const templatePath = path.join(__dirname, '..', 'templates', 'headLedgerTemplate.html');
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const compiledTemplate = handlebars.compile(templateSource);

  // Clean entity subtext from HTML tags if any (e.g. <strong>, &bull;)
  const cleanSubtext = (ledgerData.entitySubtext || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&bull;/g, '•')
    .replace(/&amp;/g, '&');

  const htmlContent = compiledTemplate({
    ...ledgerData,
    entitySubtextClean: cleanSubtext,
    generatedDate: new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    generatedBy: requestedUser?.name || 'Sarfraz Khan (Accountant - Data Entry)',
    logoBase64,
    sarfrazSignBase64,
    khurshidSignBase64,
  });

  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;

  const localExecutablePath = getBrowserExecutablePath();
  const executablePath = localExecutablePath || (await chromium.executablePath());
  const launchOptions = {
    headless: true,
    args: localExecutablePath
      ? [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ]
      : chromium.args,
    executablePath,
  };

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 45000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '10mm',
        right: '10mm',
        bottom: '12mm',
        left: '10mm',
      },
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
};

/**
 * @desc  Generate a landscape A4 PDF for the All Transactions — Central Financial Ledger
 * @param {object} data  { transactions, summary, totalCount, periodLabel, filterSummary }
 * @param {object} requestedUser
 */
export const generateAllTransactionsPDF = async (data, requestedUser) => {
  const { resolveTransactionAccountDisplay } = await import('./ledgerService.js');

  const templatePath = path.join(__dirname, '..', 'templates', 'allTransactionsTemplate.html');
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const compiledTemplate = handlebars.compile(templateSource);

  // Shape each transaction for the template
  const rows = (data.transactions || []).map((tx) => {
    const acc = resolveTransactionAccountDisplay(tx);
    return {
      date: tx.date,
      voucherNo: tx.voucherNo || '-',
      transactionType: tx.transactionType || 'OTHER',
      detail: tx.detail || tx.description || '-',
      propertyName: tx.propertyId?.plazaName || tx.propertyId?.location || '',
      headName: tx.categoryId?.name || tx.categoryName || '-',
      parentHeadName: tx.categoryId?.parentCategoryId?.name || '',
      drAccount: acc.dr || tx.drAccountId?.name || '-',
      crAccount: acc.cr || tx.crAccountId?.name || '-',
      status: tx.status || '-',
      amount: tx.amount || 0,
    };
  });

  const htmlContent = compiledTemplate({
    transactions: rows,
    summary: data.summary || {},
    totalCount: data.totalCount || rows.length,
    periodLabel: data.periodLabel || 'Selected Period',
    filterSummary: data.filterSummary || '',
    generatedDate: new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    generatedBy: requestedUser?.name || 'Sarfraz Khan (Accountant - Data Entry)',
    logoBase64,
    sarfrazSignBase64,
    khurshidSignBase64,
  });

  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;

  const localExecutablePath = getBrowserExecutablePath();
  const executablePath = localExecutablePath || (await chromium.executablePath());
  const launchOptions = {
    headless: true,
    args: localExecutablePath
      ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      : chromium.args,
    executablePath,
  };

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 60000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: { top: '8mm', right: '10mm', bottom: '10mm', left: '10mm' },
    });
    return pdfBuffer;
  } finally {
    await browser.close();
  }
};

/**
 * Standardizes any Transaction or PendingEntry into evidenceData structure
 */
export const buildEvidenceDataForEntry = (entry) => {
  const id = entry._id?.toString() || '';
  const rawAttachments =
    (entry.attachments && entry.attachments.length > 0)
      ? entry.attachments
      : (entry.entryData?.attachments && entry.entryData.attachments.length > 0)
      ? entry.entryData.attachments
      : [];

  const attachments = rawAttachments
    .map((att, idx) => {
      const url = typeof att === 'string' ? att : att?.url;
      if (!url) return null;
      const caption = (typeof att === 'object' && att?.originalName)
        ? att.originalName
        : `Receipt Evidence Image #${idx + 1}`;
      return {
        url,
        index: idx + 1,
        caption,
      };
    })
    .filter(Boolean);

  let propertyName =
    entry.propertyId?.plazaName ||
    entry.propertyId?.propertyName ||
    entry.entryData?.property?.plazaName ||
    entry.entryData?.property?.name ||
    '';
  let unitName = '';
  if (entry.propertyId?.units && entry.unitId) {
    const u = entry.propertyId.units.find(
      (un) => un._id?.toString() === entry.unitId?.toString()
    );
    if (u) unitName = u.unitName || u.unitNumber || '';
  }
  if (!unitName && entry.entryData?.unit?.unitName) {
    unitName = entry.entryData.unit.unitName;
  }

  const unitTenantName = entry.propertyId?.units?.find(
    (unit) => unit._id?.toString() === entry.unitId?.toString()
  )?.tenantName;
  const tenantName =
    entry.tenantId?.fullName ||
    entry.tenantId?.tenantName ||
    entry.agreementId?.tenantId?.fullName ||
    entry.agreementId?.tenantId?.tenantName ||
    entry.agreementId?.tenantId?.name ||
    entry.entryData?.tenant?.fullName ||
    unitTenantName ||
    '';

  const submittedByName =
    entry.submittedByName ||
    entry.submittedBy?.name ||
    entry.createdBy?.name ||
    'Sarfraz Khan (Accountant - Data Entry)';

  const verifiedByName =
    entry.verifiedByName ||
    entry.verifiedBy?.name ||
    entry.checkedBy ||
    'Khurshid Anwar';

  const categoryName =
    entry.categoryId?.name ||
    entry.entryData?.category?.name ||
    'General';
  const mainExpenseHeadName = entry.categoryId?.isMainHead
    ? entry.categoryId.name
    : entry.categoryId?.parentCategoryId?.name ||
      entry.entryData?.category?.parentCategoryId?.name ||
      categoryName;
  const expenseDebitHeadName = [mainExpenseHeadName, categoryName]
    .filter((name, index, names) => name && names.indexOf(name) === index)
    .join(' ');

  let drAccountName =
    entry.drAccountId?.name ||
    entry.receivingAccountId?.name ||
    entry.entryData?.drAccount?.name ||
    '';
  let crAccountName =
    entry.crAccountId?.name ||
    entry.entryData?.crAccount?.name ||
    '';

  const rentLocationName = [propertyName, unitName].filter(Boolean).join(' - ');

  const isRent =
    entry.entryType === 'RENT' ||
    entry.reportCategory === 'Rent' ||
    entry.sourceModule === 'RENT_RECEIVED';
  const isOtherIncome =
    entry.entryType === 'OTHER_INCOME' ||
    entry.reportCategory === 'Other Income' ||
    entry.sourceModule === 'OTHER_INCOME';

  if (entry.entryType === 'RENT' || isRent) {
    drAccountName = (!drAccountName || /Clearing|External Parties/i.test(drAccountName))
      ? (entry.receivingAccountId?.name || 'Cash Custodian / Bank')
      : drAccountName;
    crAccountName = rentLocationName || 'Rental Income';
  } else if (entry.entryType === 'OTHER_INCOME' || isOtherIncome) {
    drAccountName = drAccountName || entry.receivingAccountId?.name || 'Receiving Account (Bank/Cash)';
    crAccountName = categoryName;
  } else if (entry.entryType === 'TRANSFER') {
    drAccountName = drAccountName || 'Destination Account';
    crAccountName = crAccountName || 'Source Account';
  } else {
    const isPropertyExpense =
      entry.expenseClassification === 'PROPERTY_OWN_EXPENSE' ||
      entry.expenseClassification === 'UNIT_EXPENSE' ||
      Boolean(entry.propertyId) ||
      Boolean(entry.unitId);
    if (isPropertyExpense && rentLocationName) {
      drAccountName = `${rentLocationName} ${expenseDebitHeadName}`.trim();
    } else if (!drAccountName || /Clearing|External Parties/i.test(drAccountName)) {
      drAccountName = expenseDebitHeadName;
    }
    if (!crAccountName || /Clearing|External Parties/i.test(crAccountName)) {
      crAccountName = 'Payment Account (Bank/Cash)';
    }
  }

  const isVerified =
    entry.status === 'VERIFIED' ||
    entry.status === 'POSTED' ||
    Boolean(entry.verifiedAt);

  const documentTitle = isRent
    ? 'OFFICIAL RENT RECEIPT EVIDENCE'
    : isOtherIncome
    ? 'OFFICIAL OTHER INCOME RECEIPT EVIDENCE'
    : entry.entryType === 'TRANSFER'
    ? 'BANK / CASH TRANSFER EVIDENCE'
    : 'OFFICIAL PURCHASE & EXPENSE RECEIPT EVIDENCE';

  const voucherNo =
    entry.voucherNo ||
    entry.voucherNumber ||
    (id ? id.slice(-6).toUpperCase() : 'N/A');

  const rawDate = entry.date || entry.submittedAt || new Date();

  return {
    _id: entry._id,
    voucherNo,
    date: rawDate,
    formattedDate: formatReportDate(rawDate),
    documentTitle,
    isVerified,
    submittedByName,
    submittedAtFormatted: entry.submittedAt ? new Date(entry.submittedAt).toLocaleString('en-PK') : '',
    verifiedByName,
    propertyName,
    unitName,
    tenantName,
    rentMonth: entry.rentMonth || null,
    categoryName,
    drAccountName,
    crAccountName,
    referenceNumber: entry.referenceNumber || entry.reference || '',
    paymentMethod: entry.paymentMethod || 'CASH',
    detail: entry.detail || entry.description || entry.entryData?.detail || 'Purchase / Expense Evidence',
    amount: round2(entry.amount || 0),
    attachments,
  };
};

/**
 * Generate Multi-Page A4 PDF containing all vouchers with receipt evidence sequentially
 */
export const generateBulkReceiptEvidencePDF = async (vouchers, periodLabel = '') => {
  const templatePath = path.join(__dirname, '..', 'templates', 'bulkReceiptEvidenceTemplate.html');
  const templateSource = fs.readFileSync(templatePath, 'utf8');
  const compiledTemplate = handlebars.compile(templateSource);

  const formattedVouchers = vouchers.map((v) => ({
    ...v,
    formattedDate: formatReportDate(v.date),
  }));

  const htmlContent = compiledTemplate({
    vouchers: formattedVouchers,
    periodLabel: periodLabel || 'Selected Vouchers',
    logoBase64,
    sarfrazSignBase64,
    khurshidSignBase64,
    generatedDate: new Date().toLocaleString('en-GB'),
  });

  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;

  const localExecutablePath = getBrowserExecutablePath();
  const executablePath = localExecutablePath || (await chromium.executablePath());
  const launchOptions = {
    headless: true,
    args: localExecutablePath
      ? [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
        ]
      : chromium.args,
    executablePath,
  };

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 180000 });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: '4mm',
        right: '6mm',
        bottom: '4mm',
        left: '6mm',
      },
    });

    return pdfBuffer;
  } finally {
    await browser.close();
  }
};

/**
 * Generate a ZIP Archive containing both individual PDF voucher files and the combined master PDF
 */
export const generateBulkReceiptEvidenceZIP = async (vouchers, periodLabel = '') => {
  const zip = new JSZip();
  const cleanPeriod = (periodLabel || 'All_Transactions').replace(/[^a-zA-Z0-9_-]/g, '_');

  // 1. Generate the master combined multi-page PDF
  const masterPdfBuffer = await generateBulkReceiptEvidencePDF(vouchers, periodLabel);
  zip.file(`00_Master_Combined_All_Vouchers_${cleanPeriod}.pdf`, masterPdfBuffer);

  // 2. Generate individual voucher PDFs reusing one browser instance
  const chromium = (await import('@sparticuz/chromium')).default;
  const puppeteer = (await import('puppeteer-core')).default;
  const singleTemplatePath = path.join(__dirname, '..', 'templates', 'receiptEvidenceTemplate.html');
  const singleTemplateSource = fs.readFileSync(singleTemplatePath, 'utf8');
  const compiledSingleTemplate = handlebars.compile(singleTemplateSource);

  const localExecutablePath = getBrowserExecutablePath();
  const executablePath = localExecutablePath || (await chromium.executablePath());
  const launchOptions = {
    headless: true,
    args: localExecutablePath
      ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
      : chromium.args,
    executablePath,
  };

  const browser = await puppeteer.launch(launchOptions);
  try {
    const page = await browser.newPage();
    const folder = zip.folder('Individual_Voucher_PDFs');

    for (let i = 0; i < vouchers.length; i++) {
      const voucher = vouchers[i];
      const htmlContent = compiledSingleTemplate({
        ...voucher,
        formattedDate: formatReportDate(voucher.date),
        logoBase64,
        sarfrazSignBase64,
        khurshidSignBase64,
        generatedDate: new Date().toLocaleString('en-GB'),
      });

      await page.setContent(htmlContent, { waitUntil: 'load', timeout: 30000 });
      const singlePdf = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        pageRanges: '1',
        margin: { top: '4mm', right: '6mm', bottom: '4mm', left: '6mm' },
      });

      const vNo = voucher.voucherNo || (voucher._id ? voucher._id.toString().slice(-6) : `V${i + 1}`);
      folder.file(`Voucher_${vNo}_Receipt_Evidence.pdf`, singlePdf);
    }
  } finally {
    await browser.close();
  }

  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  return zipBuffer;
};

export default {
  generateMonthlyFundsReport,
  generateSingleVoucherPDF,
  generateReceiptEvidencePDF,
  generateBulkReceiptEvidencePDF,
  generateBulkReceiptEvidenceZIP,
  buildEvidenceDataForEntry,
  generateLedgerPDF,
  generateAllTransactionsPDF,
};

