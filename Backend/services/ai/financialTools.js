import Transaction from '../../models/Transaction.js';
import Account from '../../models/Account.js';
import Property from '../../models/Property.js';
import Tenant from '../../models/Tenant.js';
import Category from '../../models/Category.js';
import RentalAgreement from '../../models/RentalAgreement.js';
import Payroll from '../../models/Payroll.js';
import { calculateLiveAccountBalances } from '../accountBalance.js';
import { getRentalSummaryWithCarryForward } from '../rentalCarryForwardService.js';
import { round2, getHeadWiseExpenseReport } from '../ledgerService.js';
import { getUtcMonthKey, getUtcMonthDateRange } from '../salaryReportingService.js';
import { assertFinancialAccess, AiError } from './assistantSecurity.js';

/**
 * Format Date to UTC Month Bounds
 */
export const resolveMonthDateRange = (month, year) => {
  const current = getUtcMonthKey(new Date());
  const [currentYear, currentMonth] = current.split('-').map(Number);
  const y = year === undefined ? currentYear : year;
  const m = month === undefined ? currentMonth : month;
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12 || y < 2000 || `${y}-${String(m).padStart(2, '0')}` > current) throw new AiError('Choose a valid month through the current Pakistan calendar month.');
  const { startDate, endDate } = getUtcMonthDateRange(y, m);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return {
    year: y,
    month: m,
    monthName: monthNames[m - 1],
    periodString: `${y}-${String(m).padStart(2, '0')}`,
    startDate,
    endDate,
  };
};

/**
 * Tool 1: getExpenseSummary
 * Calculates total expenses and breakdown for a given period.
 */
export const getExpenseSummary = async ({ month, year, propertyId = null, startDate, endDate }, user) => {
  assertFinancialAccess(user);
  const period = resolveMonthDateRange(month, year);
  const report = await getHeadWiseExpenseReport(period.year, period.month, { propertyId, ...(startDate ? { startDate: new Date(`${startDate}T00:00:00+05:00`), endDate: new Date(`${endDate}T23:59:59.999+05:00`) } : {}) });
  const propertyTotals = new Map();
  for (const head of report.mainHeads) for (const expense of head.expenses) for (const tx of expense.transactions) {
    if (tx.property) propertyTotals.set(tx.property, round2((propertyTotals.get(tx.property) || 0) + tx.amount));
  }
  return {
    period: period.periodString,
    dateRange: `${startDate || period.periodString + '-01'} to ${endDate || new Date(period.endDate.getTime() + 18000000).toISOString().slice(0, 10)} (Pakistan time)`,
    totalExpenses: report.totalExpensesOverall,
    transactionCount: report.mainHeads.reduce((n, h) => n + h.transactionCount, 0),
    classification: report.classificationTotals,
    topExpenseHeads: report.mainHeads.slice(0, 20).map(h => ({ head: h.mainHeadName, amount: h.totalSpent })),
    expensesByProperty: [...propertyTotals].map(([property, amount]) => ({ property, amount })).sort((a, b) => b.amount - a.amount),
  };
};

/**
 * Tool 2: getIncomeSummary
 * Calculates total rental & other receipts for a given period.
 */
export const getIncomeSummary = async ({ month, year }, user) => {
  assertFinancialAccess(user);
  const period = resolveMonthDateRange(month, year);
  if (period.periodString < '2026-09') throw new AiError('Allocated rental income reports are available from September 2026.');
  const rental = await getRentalSummaryWithCarryForward(period.periodString, { rentOnly: true });
  const rows = await Transaction.aggregate([
    { $match: { date: { $gte: period.startDate, $lte: period.endDate }, transactionType: 'INCOME', reportCategory: 'Other Income', $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }] } },
    { $group: { _id: null, amount: { $sum: '$amount' } } },
  ]).option({ maxTimeMS: 10000 });
  const rentalIncome = round2(rental.grandTotals.totalReceivedAmount || 0);
  const otherIncome = round2(rows[0]?.amount || 0);
  return { period: period.periodString, totalIncome: round2(rentalIncome + otherIncome), rentalIncome, otherIncome, basis: 'Rent allocation month and other income posting date, matching monthly report conventions. Internal transfers, opening balances and owner personal transactions are excluded.' };
};

/**
 * Tool 3: getRentCollectionSummary
 * Detailed rent collection summary per plaza with collection rate.
 */
export const getRentCollectionSummary = async ({ month, year, propertyId = null }, user) => {
  assertFinancialAccess(user);
  const { year: y, month: m, monthName, periodString } = resolveMonthDateRange(month, year);

  const rentalSummary = await getRentalSummaryWithCarryForward(periodString, { rentOnly: true });

  let plazas = rentalSummary.plazas || [];
  if (propertyId) {
    plazas = plazas.filter(p => String(p.plazaId) === String(propertyId));
  }

  const plazaBreakdown = plazas.map(p => ({
    plazaName: p.plazaName,
    agreedRent: round2(p.subtotals?.agreedRent || 0),
    receivedAmount: round2(p.subtotals?.receivedAmount || 0),
    outstandingReceivable: round2(p.subtotals?.outstandingReceivable || 0),
    collectionRate: `${p.subtotals?.collectionRate || 0}%`,
    unitsCount: p.unitsCount || (p.units || []).length,
  }));

  return {
    period: `${monthName} ${y} (${periodString})`,
    totalAgreedRent: round2(plazaBreakdown.reduce((n, p) => n + p.agreedRent, 0)),
    totalReceivedAmount: round2(plazaBreakdown.reduce((n, p) => n + p.receivedAmount, 0)),
    totalOutstandingReceivable: round2(plazaBreakdown.reduce((n, p) => n + p.outstandingReceivable, 0)),
    basis: 'Allocated rent month; includes carry-forward and advance offsets. Uses current active agreements, not a historical snapshot.',
    plazas: plazaBreakdown,
  };
};

/**
 * Tool 4: getOutstandingRent
 * Overdue and outstanding rental arrears across properties and tenants.
 */
export const getOutstandingRent = async ({ month, year, propertyId = null }, user) => {
  assertFinancialAccess(user);
  const { year: y, month: m, monthName, periodString } = resolveMonthDateRange(month, year);

  const rentalSummary = await getRentalSummaryWithCarryForward(periodString, { rentOnly: true });
  let unitsWithBalance = [];

  for (const plaza of rentalSummary.plazas || []) {
    if (propertyId && String(plaza.plazaId) !== String(propertyId)) continue;

    for (const u of plaza.units || []) {
      const outstanding = Number(u.outstandingReceivable) || 0;
      if (outstanding > 0) {
        unitsWithBalance.push({
          plazaName: plaza.plazaName,
          unitName: u.unitName,
          agreedRent: round2(u.agreedRent || 0),
          receivedAmount: round2(u.receivedAmount || 0),
          outstandingAmount: round2(outstanding),
          dueDay: u.dueDay || 5,
        });
      }
    }
  }

  unitsWithBalance.sort((a, b) => b.outstandingAmount - a.outstandingAmount);

  const totalOutstanding = unitsWithBalance.reduce((sum, u) => sum + u.outstandingAmount, 0);

  return {
    period: `${monthName} ${y} (${periodString})`,
    totalOutstandingAmount: round2(totalOutstanding),
    outstandingUnitsCount: unitsWithBalance.length,
    overdueUnits: unitsWithBalance.slice(0, 30),
    truncated: unitsWithBalance.length > 30,
  };
};

/**
 * Tool 5: getAccountBalances
 * Dynamic live balances of all active bank, cash, and suspense accounts.
 */
export const getAccountBalances = async ({ accountType = null }, user) => {
  assertFinancialAccess(user);
  // If user is restricted DATA_ENTRY, check permissions
  const query = { isActive: true, isClearing: { $ne: true } };
  if (accountType) {
    query.type = accountType.toUpperCase();
  }

  const accounts = await Account.find(query).select('_id name type openingBalance').sort({ type: 1, name: 1 }).maxTimeMS(10000).lean();
  const transactions = await Transaction.find({
    $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
  }).select('drAccountId crAccountId amount status').maxTimeMS(10000).lean();

  const balanceMap = calculateLiveAccountBalances(accounts, transactions);

  const bankAccounts = [];
  const cashAccounts = [];
  const suspenseAccounts = [];
  let totalBankBalance = 0;
  let totalCashBalance = 0;
  let totalSuspenseBalance = 0;

  for (const acc of accounts) {
    const liveBal = balanceMap.get(acc._id.toString()) ?? (Number(acc.openingBalance) || 0);
    const roundedBal = round2(liveBal);

    const item = {
      accountId: acc._id,
      name: acc.name,
      type: acc.type,
      currentBalance: roundedBal,
    };

    if (acc.type === 'BANK') {
      bankAccounts.push(item);
      totalBankBalance += roundedBal;
    } else if (acc.type === 'CASH') {
      cashAccounts.push(item);
      totalCashBalance += roundedBal;
    } else {
      suspenseAccounts.push(item);
      totalSuspenseBalance += roundedBal;
    }
  }

  const netTotalLiquidity = round2(totalBankBalance + totalCashBalance);

  return {
    netTotalLiquidity,
    totalAllAccounts: round2(netTotalLiquidity + totalSuspenseBalance),
    basis: 'Live active accounts at request time, not month-end balances. Liquidity excludes suspense; totalAllAccounts includes it.',
    totalBankBalance: round2(totalBankBalance),
    totalCashBalance: round2(totalCashBalance),
    totalSuspenseBalance: round2(totalSuspenseBalance),
    bankAccounts,
    cashAccounts,
    suspenseAccounts,
  };
};

/**
 * Tool 6: getRecentTransactions
 * Retrieve latest transactions with voucher numbers, heads, accounts, and amounts.
 */
export const getRecentTransactions = async ({ limit = 10, transactionType = null, propertyId = null, month, year }, user) => {
  assertFinancialAccess(user);
  const period = resolveMonthDateRange(month, year);
  const safeLimit = Math.min(Math.max(Number(limit) || 10, 1), 25);
  const query = {
    date: { $gte: period.startDate, $lte: period.endDate },
    $nor: [{ status: /^REVERSED$/i }, { status: /^VOID$/i }],
  };

  if (transactionType) {
    query.transactionType = transactionType.toUpperCase();
  }
  if (propertyId) {
    query.propertyId = propertyId;
  }

  const txs = await Transaction.find(query)
    .sort({ date: -1, createdAt: -1 })
    .limit(safeLimit)
    .populate('categoryId', 'name')
    .populate('propertyId', 'plazaName')
    .populate('drAccountId', 'name')
    .populate('crAccountId', 'name')
    .lean();

  const transactions = txs.map(t => ({
    voucherNo: t.voucherNo || 'N/A',
    date: t.date ? new Date(t.date).toISOString().split('T')[0] : 'N/A',
    type: t.transactionType,
    head: t.categoryId?.name || t.reportCategory || 'General',
    property: t.propertyId?.plazaName || null,
    amount: round2(t.amount),
    fromAccount: t.crAccountId?.name || 'N/A',
    toAccount: t.drAccountId?.name || 'N/A',
  }));

  return {
    period: period.periodString,
    count: transactions.length,
    transactions,
  };
};

/**
 * Tool 7: getPropertyFinancialSummary
 * Financial performance of a specific property (rent collected vs expenses).
 */
export const getPropertyFinancialSummary = async ({ propertyId, propertyName = null, month, year }, user) => {
  assertFinancialAccess(user);
  const { year: y, month: m, monthName, periodString, startDate, endDate } = resolveMonthDateRange(month, year);

  let targetProperty = null;
  if (propertyId) {
    targetProperty = await Property.findById(propertyId).lean();
  } else if (propertyName) {
    targetProperty = await Property.findOne({ plazaName: new RegExp('^' + propertyName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i') }).lean();
  }

  if (!targetProperty) {
    return {
      error: 'Property not found. Please provide a valid property name (e.g. 2nd Floor Deal Land, Bahria Town, Executive Lodge) or ID.',
    };
  }

  // Get rental stats
  const rentalSummary = await getRentalSummaryWithCarryForward(periodString, { rentOnly: true });
  const plazaData = (rentalSummary.plazas || []).find(p => String(p.plazaId) === String(targetProperty._id));

  const expenseReport = await getExpenseSummary({ month: m, year: y, propertyId: String(targetProperty._id) }, user);
  const totalExpenses = expenseReport.totalExpenses;
  const expenseBreakdown = new Map(expenseReport.topExpenseHeads.map(h => [h.head, h.amount]));

  const agreedRent = round2(plazaData?.subtotals?.agreedRent || 0);
  const rentCollected = round2(plazaData?.subtotals?.receivedAmount || 0);
  const outstandingRent = round2(plazaData?.subtotals?.outstandingReceivable || 0);
  const netOperatingIncome = round2(rentCollected - totalExpenses);

  return {
    period: `${monthName} ${y} (${periodString})`,
    propertyName: targetProperty.plazaName,
    location: targetProperty.location || '',
    totalUnits: targetProperty.units?.length || 0,
    agreedRent,
    rentCollected,
    outstandingRent,
    collectionRate: `${plazaData?.subtotals?.collectionRate || 0}%`,
    totalExpenses: round2(totalExpenses),
    netOperatingCashFlow: netOperatingIncome,
    expenseBreakdown: Array.from(expenseBreakdown.entries()).map(([head, amount]) => ({
      head,
      amount: round2(amount),
    })),
  };
};

/**
 * Tool 8: getMonthlyComparison
 * Compares two months (e.g. current vs previous month) for trends and variance.
 */
export const getMonthlyComparison = async ({ month1, year1, month2, year2 }, user) => {
  assertFinancialAccess(user);
  const first = resolveMonthDateRange(month1, year1);
  const m1 = first.month;
  const y1 = first.year;

  // If month2 not supplied, default to prior month
  let m2 = Number(month2);
  let y2 = Number(year2);
  if (!m2 || !y2) {
    if (m1 === 1) {
      m2 = 12;
      y2 = y1 - 1;
    } else {
      m2 = m1 - 1;
      y2 = y1;
    }
  }

  const [exp1, inc1, rent1] = await Promise.all([
    getExpenseSummary({ month: m1, year: y1 }, user),
    getIncomeSummary({ month: m1, year: y1 }, user),
    getRentCollectionSummary({ month: m1, year: y1 }, user),
  ]);

  const [exp2, inc2, rent2] = await Promise.all([
    getExpenseSummary({ month: m2, year: y2 }, user),
    getIncomeSummary({ month: m2, year: y2 }, user),
    getRentCollectionSummary({ month: m2, year: y2 }, user),
  ]);

  const net1 = round2(inc1.totalIncome - exp1.totalExpenses);
  const net2 = round2(inc2.totalIncome - exp2.totalExpenses);

  return {
    period1: exp1.period,
    period2: exp2.period,
    period1Data: {
      totalIncome: inc1.totalIncome,
      rentalIncome: inc1.rentalIncome,
      totalExpenses: exp1.totalExpenses,
      netCashFlow: net1,
      rentCollected: rent1.totalReceivedAmount,
    },
    period2Data: {
      totalIncome: inc2.totalIncome,
      rentalIncome: inc2.rentalIncome,
      totalExpenses: exp2.totalExpenses,
      netCashFlow: net2,
      rentCollected: rent2.totalReceivedAmount,
    },
    variance: {
      incomeChange: round2(inc1.totalIncome - inc2.totalIncome),
      expenseChange: round2(exp1.totalExpenses - exp2.totalExpenses),
      netCashFlowChange: round2(net1 - net2),
    },
  };
};

/**
 * Tool 9: getSalarySummary
 * Total salaries disbursed and pending staff payroll for a given month.
 */
export const getSalarySummary = async ({ month, year, startDate, endDate }, user) => {
  assertFinancialAccess(user);
  const period = resolveMonthDateRange(month, year);
  const report = await getHeadWiseExpenseReport(period.year, period.month, startDate ? { startDate: new Date(`${startDate}T00:00:00+05:00`), endDate: new Date(`${endDate}T23:59:59.999+05:00`) } : {});
  const salary = report.mainHeads.filter(h => h.mainHeadId === 'salary');
  const payrolls = await Payroll.find({ payrollMonth: period.periodString }).select('netPayable paymentStatus status').maxTimeMS(10000).lean();
  return {
    period: startDate ? `${startDate} to ${endDate} (Pakistan time)` : period.periodString,
    totalSalariesDisbursed: round2(salary.reduce((n, h) => n + h.totalSpent, 0)),
    totalPayrollCommitted: round2(payrolls.reduce((n, p) => n + (p.netPayable || 0), 0)),
    paidEmployeesCount: payrolls.filter(p => p.paymentStatus === 'PAID' || p.status === 'PAID').length,
    employeesCount: payrolls.length,
    basis: 'Disbursements use expense posting date and existing Salary classification; payroll commitment uses payroll month. Staff loans are excluded.',
  };
};

/**
 * Master tools catalog metadata for LLM tool calling declarations
 */
export const FINANCIAL_TOOL_DECLARATIONS = [
  {
    name: 'getExpenseSummary',
    description: 'Get verified total expenses, category breakdown, and property expense classifications for a specific month and year.',
    parameters: {
      type: 'OBJECT',
      properties: {
        month: { type: 'INTEGER', description: 'Month number (1-12). Defaults to current month.' },
        year: { type: 'INTEGER', description: 'Four-digit year (e.g. 2026).' },
        propertyId: { type: 'STRING', description: 'Optional MongoDB ID of a specific property/plaza.' },
      },
    },
  },
  {
    name: 'getIncomeSummary',
    description: 'Get verified total income including rental receipts and other income for a specific month and year.',
    parameters: {
      type: 'OBJECT',
      properties: {
        month: { type: 'INTEGER', description: 'Month number (1-12).' },
        year: { type: 'INTEGER', description: 'Four-digit year (e.g. 2026).' },
      },
    },
  },
  {
    name: 'getRentCollectionSummary',
    description: 'Get rent collection summary including total agreed rent, received rent, outstanding balance, and collection percentages across all plazas or a specific property.',
    parameters: {
      type: 'OBJECT',
      properties: {
        month: { type: 'INTEGER', description: 'Month number (1-12).' },
        year: { type: 'INTEGER', description: 'Four-digit year (e.g. 2026).' },
        propertyId: { type: 'STRING', description: 'Optional property ID to filter by single plaza.' },
      },
    },
  },
  {
    name: 'getOutstandingRent',
    description: 'Get list of overdue rent balances and unpaid tenant arrears across all plazas or a specific property.',
    parameters: {
      type: 'OBJECT',
      properties: {
        month: { type: 'INTEGER', description: 'Month number (1-12).' },
        year: { type: 'INTEGER', description: 'Four-digit year (e.g. 2026).' },
        propertyId: { type: 'STRING', description: 'Optional property ID.' },
      },
    },
  },
  {
    name: 'getAccountBalances',
    description: 'Get dynamic live balances of all active bank accounts, cash custodians (cash in hand), and suspense accounts.',
    parameters: {
      type: 'OBJECT',
      properties: {
        accountType: { type: 'STRING', description: 'Optional filter: BANK, CASH, or SUSPENSE.' },
      },
    },
  },
  {
    name: 'getRecentTransactions',
    description: 'Get list of recently recorded vouchers and transactions with dates, voucher numbers, account details, and amounts.',
    parameters: {
      type: 'OBJECT',
      properties: {
        limit: { type: 'INTEGER', description: 'Number of recent transactions to return (1-25, default 10).' },
        transactionType: { type: 'STRING', description: 'Optional filter: EXPENSE, INCOME, or TRANSFER.' },
      },
    },
  },
  {
    name: 'getPropertyFinancialSummary',
    description: 'Get financial performance of a specific property (agreed rent, collected rent, expenses, and net operational profit/loss).',
    parameters: {
      type: 'OBJECT',
      properties: {
        propertyName: { type: 'STRING', description: 'Name of the property or plaza (e.g. 2nd Floor Deal Land, Bahria Town, Executive Lodge).' },
        month: { type: 'INTEGER', description: 'Month number (1-12).' },
        year: { type: 'INTEGER', description: 'Four-digit year (e.g. 2026).' },
      },
    },
  },
  {
    name: 'getMonthlyComparison',
    description: 'Compare financial performance (income, expenses, net cash flow, rent collection) between two months.',
    parameters: {
      type: 'OBJECT',
      properties: {
        month1: { type: 'INTEGER', description: 'First month number (1-12).' },
        year1: { type: 'INTEGER', description: 'First year (e.g. 2026).' },
        month2: { type: 'INTEGER', description: 'Second month number (1-12).' },
        year2: { type: 'INTEGER', description: 'Second year (e.g. 2026).' },
      },
    },
  },
  {
    name: 'getSalarySummary',
    description: 'Get salary disbursements and pending staff payroll for a given month and year.',
    parameters: {
      type: 'OBJECT',
      properties: {
        month: { type: 'INTEGER', description: 'Month number (1-12).' },
        year: { type: 'INTEGER', description: 'Four-digit year (e.g. 2026).' },
      },
    },
  },
];

for (const name of ['getExpenseSummary', 'getSalarySummary']) {
  const properties = FINANCIAL_TOOL_DECLARATIONS.find(t => t.name === name).parameters.properties;
  properties.startDate = { type: 'STRING', description: 'Optional YYYY-MM-DD, within selected month; requires endDate.' };
  properties.endDate = { type: 'STRING', description: 'Optional YYYY-MM-DD, within selected month; requires startDate.' };
}
Object.assign(FINANCIAL_TOOL_DECLARATIONS.find(t => t.name === 'getRecentTransactions').parameters.properties, {
  month: { type: 'INTEGER', description: 'Month 1-12; default current Pakistan month.' },
  year: { type: 'INTEGER', description: 'Four-digit year.' },
});

/**
 * Execute tool by name with parameter validation
 */
export const executeFinancialTool = async (name, args = {}, user) => {
  assertFinancialAccess(user);
  validateToolArguments(name, args);
  switch (name) {
    case 'getExpenseSummary':
      return await getExpenseSummary(args, user);
    case 'getIncomeSummary':
      return await getIncomeSummary(args, user);
    case 'getRentCollectionSummary':
      return await getRentCollectionSummary(args, user);
    case 'getOutstandingRent':
      return await getOutstandingRent(args, user);
    case 'getAccountBalances':
      return await getAccountBalances(args, user);
    case 'getRecentTransactions':
      return await getRecentTransactions(args, user);
    case 'getPropertyFinancialSummary':
      return await getPropertyFinancialSummary(args, user);
    case 'getMonthlyComparison':
      return await getMonthlyComparison(args, user);
    case 'getSalarySummary':
      return await getSalarySummary(args, user);
    default:
      throw new Error(`Unknown financial tool: ${name}`);
  }
};

export function validateToolArguments(name, args) {
  const declaration = FINANCIAL_TOOL_DECLARATIONS.find(t => t.name === name);
  if (!declaration || !args || typeof args !== 'object' || Array.isArray(args)) throw new AiError('Unsupported read-only financial tool.');
  const allowed = new Set(Object.keys(declaration.parameters.properties));
  if (name === 'getRecentTransactions') { allowed.add('month'); allowed.add('year'); }
  if (name === 'getExpenseSummary' || name === 'getSalarySummary') { allowed.add('startDate'); allowed.add('endDate'); }
  for (const [key, value] of Object.entries(args)) {
    if (!allowed.has(key)) throw new AiError('Unsupported financial filter.');
    if (/^(month|month1|month2|year|year1|year2|limit)$/.test(key) && !Number.isInteger(value)) throw new AiError('Month, year and limit must be integers.');
    if (key === 'propertyId' && (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value))) throw new AiError('Invalid property identifier.');
    if (key === 'propertyName' && (typeof value !== 'string' || !value.trim() || value.length > 100)) throw new AiError('Invalid property name.');
    if (key === 'accountType' && !['BANK', 'CASH', 'SUSPENSE'].includes(value)) throw new AiError('Invalid account type.');
    if (key === 'transactionType' && !['EXPENSE', 'INCOME', 'TRANSFER'].includes(value)) throw new AiError('Invalid transaction type.');
    if (key === 'limit' && (value < 1 || value > 25)) throw new AiError('Transaction limit must be 1–25.');
  }
  if (name === 'getMonthlyComparison') {
    const first = resolveMonthDateRange(args.month1, args.year1);
    const prior = new Date(Date.UTC(first.year, first.month - 2, 1));
    const second = resolveMonthDateRange(args.month2 ?? prior.getUTCMonth() + 1, args.year2 ?? prior.getUTCFullYear());
    if (first.periodString < '2026-09' || second.periodString < '2026-09') throw new AiError('Rental comparison is available from September 2026.');
  } else if (name !== 'getAccountBalances') {
    const period = resolveMonthDateRange(args.month, args.year);
    if (['getIncomeSummary', 'getRentCollectionSummary', 'getOutstandingRent', 'getPropertyFinancialSummary'].includes(name) && period.periodString < '2026-09') throw new AiError('Rental reports are available from September 2026.');
    if (args.startDate || args.endDate) {
      for (const d of [args.startDate, args.endDate]) if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d || d.slice(0, 7) !== period.periodString) throw new AiError('Choose valid dates within the selected month.');
      if (args.startDate > args.endDate) throw new AiError('Start date must precede end date.');
    }
  }
}
