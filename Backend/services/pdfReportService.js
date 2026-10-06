import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import handlebars from 'handlebars';

import Transaction from '../models/Transaction.js';
import Property from '../models/Property.js';
import Account from '../models/Account.js';
import Category from '../models/Category.js';
import MonthlyReport from '../models/MonthlyReport.js';
import {
  getMonthlyOpeningClosingMatrix,
  getHeadWiseExpenseReport,
  getAccountRunningLedger,
  resolveTransactionAccountDisplay,
  buildHeadWiseReportItems,
  round2,
} from './ledgerService.js';
import { getUtcMonthDateRange, getUtcMonthEndDate } from './salaryReportingService.js';
import { isOwnerPersonalTransaction } from './expenseClassificationService.js';
import { getLiquidityStatementAmounts } from './ledgerPresentation.js';

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
  const properties = await Property.find({})
    .populate('units.defaultReceivingAccountId', 'name type')
    .sort({ plazaName: 1 })
    .lean();

  const [repYear, repMonth] = periodName.split('-').map(Number);
  const currentMonthLabel = `${monthNames[repMonth - 1]}-${repYear}`;
  const prevDate = new Date(Date.UTC(repYear, repMonth - 2, 1));
  const priorMonthLabel = `${monthNames[prevDate.getUTCMonth()]}-${prevDate.getUTCFullYear()}`;
  const isBaselineJuly = periodName === '2026-08';

  let totAgreed = 0;
  let totPrior = 0;
  let totCurrentDue = 0;
  let totReceived = 0;
  let totReceivable = 0;
  let totAdvance = 0;

  const plazaList = properties.map(plaza => {
    const units = (plaza.units || []).map(unit => {
      const agreed = round2(unit.agreedRent || 0);
      const currentDue = agreed;

      let prior = 0;
      if (isBaselineJuly) {
        prior = round2(unit.julyReceivable || 0);
      } else {
        prior = round2(Math.max(0, unit.julyReceivable || 0));
      }

      const matchingTxs = transactions.filter(t => {
        const pId = t.propertyId?._id?.toString() || t.propertyId?.toString();
        const uId = t.unitId?.toString();
        const isRent = t.reportCategory === 'Rent' || t.sourceModule === 'RENT_RECEIVED';
        return isRent && pId === plaza._id.toString() && uId === unit._id.toString();
      });

      const received = round2(
        matchingTxs.reduce((sum, t) => sum + (t.amount || 0), 0)
      );

      const latestTx = matchingTxs[matchingTxs.length - 1];
      const receivingBank = (latestTx && received > 0)
        ? (latestTx.drAccountId?.name || '-')
        : '-';
      const receivedDate = (latestTx && received > 0 && latestTx.date) ? formatReportDate(latestTx.date) : '-';
      const renewalDate = unit.renewalDate ? formatReportDate(unit.renewalDate) : '-';

      let receivable = 0;
      let advanceRent = 0;

      // Special corporate bank handling when rent received is 0
      const isCorporateBank = unit.unitName && /Allied Bank/i.test(unit.unitName);

      if (isCorporateBank && received === 0) {
        receivable = 0;
        advanceRent = 0;
      } else if (isBaselineJuly && prior < 0) {
        const priorAdvance = Math.abs(prior);
        const totalCovered = round2(received + priorAdvance);
        receivable = round2(Math.max(0, currentDue - totalCovered));
        advanceRent = round2(Math.max(0, totalCovered - currentDue));
      } else {
        // Standard proper accounting allocation:
        // 1. Received covers prior arrears first
        // 2. Remaining received covers current month rent
        // 3. Any surplus received is Advance Rent (e.g. October rent collected in September)
        const totalPayable = round2(currentDue + Math.max(0, prior));
        if (received >= totalPayable) {
          receivable = 0;
          advanceRent = round2(received - totalPayable);
        } else {
          receivable = round2(totalPayable - received);
          advanceRent = 0;
        }
      }

      totAgreed += agreed;
      totPrior += prior;
      totCurrentDue += currentDue;
      totReceived += received;
      totReceivable += receivable;
      totAdvance += advanceRent;

      return {
        unitName: `${unit.unitName}${unit.tenantName ? ' - ' + unit.tenantName : ''}`,
        dueDay: unit.dueDay ? `${unit.dueDay}th` : '1st',
        agreedRent: agreed,
        priorReceivable: prior,
        julyReceivable: prior, // backward compatibility
        isPriorNeg: prior < 0,
        currentActualRent: currentDue,
        augustActualRent: currentDue, // backward compatibility
        receivedAmount: received,
        receivedDate,
        receivingBank,
        renewalDate,
        receivable,
        advanceRent,
      };
    });

    return {
      plazaName: plaza.plazaName,
      units,
    };
  });

  const page3Tenancy = {
    priorMonthLabel,
    currentMonthLabel,
    plazas: plazaList,
    totals: {
      agreedRent: round2(totAgreed),
      priorReceivable: round2(totPrior),
      julyReceivable: round2(totPrior),
      isPriorNeg: totPrior < 0,
      currentActualRent: round2(totCurrentDue),
      augustActualRent: round2(totCurrentDue),
      receivedAmount: round2(totReceived),
      receivable: round2(totReceivable),
      advanceRent: round2(totAdvance),
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

    let bankOrCashTitle = acc.name;
    let accountSubtitle = 'Kamran Ijaz Sb';

    if (acc.name.includes('Bank Al Falah') || acc.name.includes('Bank Al-Falah')) {
      bankOrCashTitle = 'Bank Al-Falah';
      accountSubtitle = 'Kamran Ijaz Sb';
    } else if (acc.name.includes('UBL (Kamran')) {
      bankOrCashTitle = 'UBL';
      accountSubtitle = 'Kamran Ijaz Sb';
    } else if (acc.name.includes('UBL (Uraan')) {
      bankOrCashTitle = 'UBL';
      accountSubtitle = 'Uraan Ventures';
    } else if (acc.name.includes('ABL (Kamran')) {
      bankOrCashTitle = 'Allied Bank';
      accountSubtitle = 'Kamran Ijaz Sb';
    } else if (acc.name.includes('ABL (Uraan')) {
      bankOrCashTitle = 'Allied Bank';
      accountSubtitle = 'Uraan Ventures';
    } else if (acc.type === 'SUSPENSE') {
      bankOrCashTitle = acc.name;
      accountSubtitle = 'Suspense / Holding Account';
    } else if (isCash) {
      bankOrCashTitle = 'Pixx Technologies';
      accountSubtitle = acc.name;
    }

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

export default {
  generateMonthlyFundsReport,
  generateSingleVoucherPDF,
  generateReceiptEvidencePDF,
  generateLedgerPDF,
  generateAllTransactionsPDF,
};
