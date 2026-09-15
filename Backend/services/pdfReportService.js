import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import handlebars from 'handlebars';
import puppeteer from 'puppeteer';

import Transaction from '../models/Transaction.js';
import Property from '../models/Property.js';
import Account from '../models/Account.js';
import Category from '../models/Category.js';
import MonthlyReport from '../models/MonthlyReport.js';
import {
  getMonthlyOpeningClosingMatrix,
  getHeadWiseExpenseReport,
  getAccountRunningLedger,
  round2,
} from './ledgerService.js';

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
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthName = monthNames[month - 1];
  const monthNameYear = `${monthName}-${year}`;
  const asOfDate = `31-${monthName}-${year}`;
  const shortAsOfDate = `31-${String(month).padStart(2, '0')}-${year}`;
  const dayDateString = `Monday, ${monthName} 31, ${year}`;

  // Fetch report status and audit metadata if available
  const monthlyReport = await MonthlyReport.findOne({ month: periodName }).lean();

  // 1. Fetch Live Matrix & Macro Figures from Central Ledger (Pure Dynamic Data)
  const matrixData = await getMonthlyOpeningClosingMatrix(year, month);
  const { grandTotal, rows: matrixRows } = matrixData;

  // Query real transactions for income & expenses to compute authoritative macro figures
  const [rentTxs, otherIncomeTxs, expenseTxs] = await Promise.all([
    Transaction.find({
      date: { $gte: startDate, $lte: endDate },
      transactionType: 'INCOME',
      reportCategory: 'Rent',
      status: { $ne: 'REVERSED' },
    }).lean(),
    Transaction.find({
      date: { $gte: startDate, $lte: endDate },
      transactionType: 'INCOME',
      reportCategory: 'Other Income',
      status: { $ne: 'REVERSED' },
    }).lean(),
    Transaction.find({
      date: { $gte: startDate, $lte: endDate },
      transactionType: 'EXPENSE',
      status: { $ne: 'REVERSED' },
    }).lean(),
  ]);

  const totalRentalIncomeReceived = round2(rentTxs.reduce((sum, t) => sum + (t.amount || 0), 0));
  const totalOtherReceipts = round2(otherIncomeTxs.reduce((sum, t) => sum + (t.amount || 0), 0));
  const totalAmountAvailable = round2(totalRentalIncomeReceived + totalOtherReceipts);
  const totalNetExpenses = round2(expenseTxs.reduce((sum, t) => sum + (t.amount || 0), 0));
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
  const transactions = await Transaction.find({
    date: { $gte: startDate, $lte: endDate },
  })
    .populate('categoryId', 'name type isRentalHead')
    .populate('drAccountId', 'name type')
    .populate('crAccountId', 'name type')
    .populate('propertyId', 'plazaName')
    .sort({ date: 1, voucherNo: 1 })
    .lean();

  // Filter only expenses for Master Journal if appropriate, or show all
  const expenseTransactions = transactions.filter(t => t.categoryId?.type === 'EXPENSE');
  const masterJournalList = (expenseTransactions.length > 0 ? expenseTransactions : transactions).map(tx => ({
    date: formatShortDate(tx.date),
    vn: tx.voucherNo,
    detail: tx.detail,
    head: tx.categoryId?.name || 'General Expense',
    category: 'Payments',
    dr: tx.drAccountId?.name || 'Cash Custodian',
    cr: tx.crAccountId?.name || tx.categoryId?.name || 'Expense Head',
    amount: round2(tx.amount),
  }));

  const totalJournalAmount = round2(
    masterJournalList.reduce((sum, v) => sum + v.amount, 0)
  );

  const masterJournal = {
    vouchers: masterJournalList,
    totalAmount: totalJournalAmount,
  };

  // 4. Fetch Head-Wise Expenses (Pages 6, 7 & 8)
  const headWise = await getHeadWiseExpenseReport(year, month);
  const headWiseGroups = headWise.heads.filter(h => h.totalSpent > 0).map(h => ({
    headName: h.headName,
    totalAmount: h.totalSpent,
    items: h.transactions.map(t => ({
      detail: t.detail,
      amount: t.amount,
      vn: t.voucherNo,
    })),
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

  let totAgreed = 0;
  let totJulyPrior = 0;
  let totAugustActual = 0;
  let totReceived = 0;
  let totReceivable = 0;
  let totAdvance = 0;

  const plazaList = properties.map(plaza => {
    const units = (plaza.units || []).map(unit => {
      const agreed = round2(unit.agreedRent || 0);
      const prior = round2(unit.julyReceivable || 0);
      const currentDue = agreed;

      const matchingTxs = transactions.filter(
        t =>
          t.propertyId?._id?.toString() === plaza._id.toString() &&
          t.unitId?.toString() === unit._id.toString()
      );

      const received = round2(
        matchingTxs.reduce((sum, t) => sum + (t.amount || 0), 0)
      );

      const latestTx = matchingTxs[matchingTxs.length - 1];
      const receivingBank =
        latestTx?.drAccountId?.name || unit.defaultReceivingAccountId?.name || 'ABL(Uraan Ventures)';
      const receivedDate = latestTx?.date ? formatReportDate(latestTx.date) : '-';
      const renewalDate = unit.renewalDate ? formatReportDate(unit.renewalDate) : '-';

      const priorArrears = prior > 0 ? prior : 0;
      const priorAdvance = prior < 0 ? Math.abs(prior) : 0;
      const totalPayable = round2(currentDue + priorArrears);
      const totalCovered = round2(received + priorAdvance);

      const receivable = round2(Math.max(0, totalPayable - totalCovered));
      const advanceRent = round2(Math.max(0, totalCovered - totalPayable));

      totAgreed += agreed;
      totJulyPrior += prior;
      totAugustActual += currentDue;
      totReceived += received;
      totReceivable += receivable;
      totAdvance += advanceRent;

      return {
        unitName: `${unit.unitName}${unit.tenantName ? ' - ' + unit.tenantName : ''}`,
        dueDay: unit.dueDay ? `${unit.dueDay}th` : '1st',
        agreedRent: agreed,
        julyReceivable: prior,
        isPriorNeg: prior < 0,
        augustActualRent: currentDue,
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
    plazas: plazaList,
    totals: {
      agreedRent: round2(totAgreed),
      julyReceivable: round2(totJulyPrior),
      isPriorNeg: totJulyPrior < 0,
      augustActualRent: round2(totAugustActual),
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
    } else if (isCash) {
      bankOrCashTitle = 'Pixx Technologies';
      accountSubtitle = acc.name;
    }

    const entries = statement.entries.map(e => ({
      date: formatReportDate(e.date),
      vn: e.voucherNo || '-',
      detail: e.detail,
      drAccount: isCash ? (e.drAmount ? e.counterpartyAccount : acc.name) : '',
      crAccount: isCash ? (e.crAmount ? e.counterpartyAccount : acc.name) : '',
      drAmount: e.drAmount,
      crAmount: e.crAmount,
      debit: e.crAmount,  // In bank statements, debit = withdrawal/expense
      credit: e.drAmount, // In bank statements, credit = deposit/rent
      balance: e.runningBalance,
      isNeg: e.runningBalance < 0,
    }));

    accountStatements.push({
      bankOrCashTitle,
      accountSubtitle,
      accountNumber: acc.accountNumber,
      isCashCustodian: isCash,
      priorDate: `31-07-${String(year).slice(-2)}`,
      openingBalance: statement.previousBalance,
      entries,
      totalDr: isCash ? statement.totalDebits : statement.totalCredits, // deposits for bank
      totalCr: isCash ? statement.totalCredits : statement.totalDebits, // withdrawals for bank
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
    preparedByName: monthlyReport?.preparedByName || 'System Operator',
    checkedByName: monthlyReport?.reviewedByName || 'Management / Auditor',
    publishedByName: monthlyReport?.publishedByName || '',
    generatedDate: formatReportDate(new Date()),
  });

  // 8. Launch Puppeteer with fallback
  const executablePath = getBrowserExecutablePath();
  const launchOptions = {
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  };
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

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

export default { generateMonthlyFundsReport };
