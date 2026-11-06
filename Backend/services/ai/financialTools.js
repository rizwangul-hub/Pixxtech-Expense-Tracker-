import Transaction from '../../models/Transaction.js';
import Account from '../../models/Account.js';
import Property from '../../models/Property.js';
import Payroll from '../../models/Payroll.js';
import Employee from '../../models/Employee.js';
import StaffLoan from '../../models/StaffLoan.js';
import Tenant from '../../models/Tenant.js';
import { calculateLiveAccountBalances } from '../accountBalance.js';
import { getRentalSummaryWithCarryForward } from '../rentalCarryForwardService.js';
import { round2, getHeadWiseExpenseReport, getAccountRunningLedger } from '../ledgerService.js';
import { getUtcMonthKey, getUtcMonthDateRange } from '../salaryReportingService.js';
import { assertFinancialAccess, AiError } from './assistantSecurity.js';
import { BUSINESS_TOOL_DECLARATIONS, LEGACY_EXTENSION, validateBusinessArguments } from './businessToolCatalog.js';
import { BUSINESS_HANDLERS } from './businessToolExecutor.js';

/**
 * Format Date to UTC Month Bounds
 */
export const resolveMonthDateRange = (month, year) => {
  const current = getUtcMonthKey(new Date());
  const [currentYear, currentMonth] = current.split('-').map(Number);
  const y = year === undefined ? currentYear : year;
  const m = month === undefined ? currentMonth : month;
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12 || y < 2000 || `${y}-${String(m).padStart(2, '0')}` > current) {
    throw new AiError('Choose a valid month through the current Pakistan calendar month.');
  }
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

const comparisonPeriods = ({ month1, year1, month2, year2 }) => {
  const first = resolveMonthDateRange(month1, year1);
  const prior = new Date(Date.UTC(first.year, first.month - 2, 1));
  const second = resolveMonthDateRange(month2 ?? prior.getUTCMonth() + 1, year2 ?? prior.getUTCFullYear());
  return { first, second };
};

/**
 * Tool 1: getExpenseSummary
 * Calculates total expenses and breakdown for a given period.
 */
export const getExpenseSummary = async ({ month, year, propertyId = null, propertyName = null, categoryName = null, startDate, endDate }, user) => {
  assertFinancialAccess(user);
  const period = resolveMonthDateRange(month, year);

  let targetPropertyId = propertyId;
  if (!targetPropertyId && propertyName) {
    const escaped = propertyName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prop = await Property.findOne({ plazaName: new RegExp(escaped, 'i') }).lean();
    if (prop) targetPropertyId = String(prop._id);
  }

  const report = await getHeadWiseExpenseReport(period.year, period.month, {
    propertyId: targetPropertyId,
    ...(startDate ? { startDate: new Date(`${startDate}T00:00:00+05:00`), endDate: new Date(`${endDate}T23:59:59.999+05:00`) } : {})
  });

  const propertyTotals = new Map();
  for (const head of report.mainHeads) {
    for (const expense of head.expenses) {
      for (const tx of expense.transactions) {
        if (tx.property) propertyTotals.set(tx.property, round2((propertyTotals.get(tx.property) || 0) + tx.amount));
      }
    }
  }

  let filteredHeads = report.mainHeads;
  if (categoryName) {
    const catLower = categoryName.toLowerCase();
    filteredHeads = report.mainHeads.filter(h =>
      h.mainHeadName.toLowerCase().includes(catLower) ||
      h.expenses.some(e => e.expenseHeadName.toLowerCase().includes(catLower))
    );
  }

  const totalFilteredExpenses = round2(filteredHeads.reduce((s, h) => s + h.totalSpent, 0));

  return {
    period: period.periodString,
    dateRange: `${startDate || period.periodString + '-01'} to ${endDate || new Date(period.endDate.getTime() + 18000000).toISOString().slice(0, 10)} (Pakistan time)`,
    totalExpenses: categoryName ? totalFilteredExpenses : report.totalExpensesOverall,
    categoryFilter: categoryName || 'ALL_CATEGORIES',
    transactionCount: filteredHeads.reduce((n, h) => n + h.transactionCount, 0),
    classification: report.classificationTotals,
    topExpenseHeads: filteredHeads.slice(0, 20).map(h => ({ head: h.mainHeadName, amount: h.totalSpent })),
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
  return {
    period: period.periodString,
    totalIncome: round2(rentalIncome + otherIncome),
    rentalIncome,
    otherIncome,
    basis: 'Rent allocation month and other income posting date, matching monthly report conventions. Internal transfers, opening balances and owner personal transactions are excluded.'
  };
};

/**
 * Tool 3: getRentCollectionSummary
 * Detailed rent collection summary per plaza with collection rate.
 */
export const getRentCollectionSummary = async ({ month, year, propertyId = null, propertyName = null }, user) => {
  assertFinancialAccess(user);
  const { year: y, month: m, monthName, periodString } = resolveMonthDateRange(month, year);
  if (periodString < '2026-09') throw new AiError('Rental reports are available from September 2026.');

  let targetPropertyId = propertyId;
  if (!targetPropertyId && propertyName) {
    const escaped = propertyName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prop = await Property.findOne({ plazaName: new RegExp(escaped, 'i') }).lean();
    if (prop) targetPropertyId = String(prop._id);
  }

  const rentalSummary = await getRentalSummaryWithCarryForward(periodString, { rentOnly: true });

  let plazas = rentalSummary.plazas || [];
  if (targetPropertyId) {
    plazas = plazas.filter(p => String(p.plazaId) === String(targetPropertyId));
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
export const getOutstandingRent = async ({ month, year, propertyId = null, propertyName = null }, user) => {
  assertFinancialAccess(user);
  const { year: y, month: m, monthName, periodString } = resolveMonthDateRange(month, year);
  if (periodString < '2026-09') throw new AiError('Rental reports are available from September 2026.');

  let targetPropertyId = propertyId;
  if (!targetPropertyId && propertyName) {
    const escaped = propertyName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prop = await Property.findOne({ plazaName: new RegExp(escaped, 'i') }).lean();
    if (prop) targetPropertyId = String(prop._id);
  }

  const rentalSummary = await getRentalSummaryWithCarryForward(periodString, { rentOnly: true });
  let unitsWithBalance = [];

  for (const plaza of rentalSummary.plazas || []) {
    if (targetPropertyId && String(plaza.plazaId) !== String(targetPropertyId)) continue;

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
    basis: 'Outstanding balance including prior arrears and advance offsets, not only overdue rent. Uses current active agreements and allocation months.',
    outstandingUnitsCount: unitsWithBalance.length,
    overdueUnits: unitsWithBalance.slice(0, 30),
    truncated: unitsWithBalance.length > 30,
  };
};

/**
 * Tool 5: getAccountBalances
 * Dynamic live balances of all active bank, cash, and suspense accounts.
 */
export const getAccountBalances = async ({ accountType = null, accountName = null, accountId = null }, user) => {
  assertFinancialAccess(user);
  const query = { isActive: true, isClearing: { $ne: true } };
  if(accountId) query._id=accountId;
  if (accountType) {
    query.type = accountType.toUpperCase();
  }

  let accounts = await Account.find(query).select('_id name type openingBalance').sort({ type: 1, name: 1 }).maxTimeMS(10000).lean();

  if (accountName) {
    const nameRegex = new RegExp(accountName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    accounts = accounts.filter(a => nameRegex.test(a.name));
  }

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
export const getRecentTransactions = async ({ limit = 10, transactionType = null, propertyId = null, propertyName = null, accountName = null, accountId = null, month, year }, user) => {
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
  if(accountId) query.$or=[{drAccountId:accountId},{crAccountId:accountId}];
  if (propertyId) {
    query.propertyId = propertyId;
  } else if (propertyName) {
    const prop = await Property.findOne({ plazaName: new RegExp(propertyName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).lean();
    if (prop) query.propertyId = prop._id;
  }
  if (accountName) {
    const acc = await Account.findOne({ name: new RegExp(accountName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).lean();
    if (acc) {
      query.$or = [{ drAccountId: acc._id }, { crAccountId: acc._id }];
    }
  }

  const txs = await Transaction.find(query)
    .select('voucherNo date transactionType reportCategory categoryId propertyId drAccountId crAccountId amount detail')
    .sort({ date: -1, createdAt: -1 })
    .limit(safeLimit)
    .populate('categoryId', 'name')
    .populate('propertyId', 'plazaName')
    .populate('drAccountId', 'name')
    .populate('crAccountId', 'name')
    .maxTimeMS(10000)
    .lean();

  const transactions = txs.map(t => ({
    voucherNo: t.voucherNo || 'N/A',
    date: t.date ? new Date(new Date(t.date).getTime() + 18000000).toISOString().slice(0, 10) : 'N/A',
    type: t.transactionType,
    head: t.categoryId?.name || t.reportCategory || 'General',
    property: t.propertyId?.plazaName || null,
    amount: round2(t.amount),
    fromAccount: t.crAccountId?.name || 'N/A',
    toAccount: t.drAccountId?.name || 'N/A',
    narration: t.detail || '',
  }));

  return {
    period: period.periodString,
    timeZone: 'Asia/Karachi',
    count: transactions.length,
    transactions,
  };
};

/**
 * Tool 7: getPropertyFinancialSummary
 * Financial performance of a specific property (rent collected vs expenses).
 */
export const getPropertyFinancialSummary = async ({ propertyId = null, propertyName = null, month, year }, user) => {
  assertFinancialAccess(user);
  const { year: y, month: m, monthName, periodString } = resolveMonthDateRange(month, year);
  if (periodString < '2026-09') throw new AiError('Rental reports are available from September 2026.');

  let targetProperty = null;
  if (propertyId) {
    targetProperty = await Property.findById(propertyId).lean();
  } else if (propertyName) {
    const escaped = propertyName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    targetProperty = await Property.findOne({ plazaName: new RegExp('^' + escaped + '$', 'i') }).lean();
    if (!targetProperty) {
      targetProperty = await Property.findOne({ plazaName: new RegExp(escaped, 'i') }).lean();
    }
    if (!targetProperty) {
      const firstToken = propertyName.trim().split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      targetProperty = await Property.findOne({ plazaName: new RegExp('^' + firstToken, 'i') }).lean();
    }
  }

  if (!targetProperty) {
    const allProps = await Property.find({}).select('plazaName').limit(10).lean();
    return {
      error: `Property '${propertyName || propertyId}' was not found.`,
      availableProperties: allProps.map(p => p.plazaName),
    };
  }

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
  const { first, second } = comparisonPeriods({ month1, year1, month2, year2 });
  const m1 = first.month;
  const y1 = first.year;

  const m2 = second.month;
  const y2 = second.year;

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
    basis: 'Income uses allocated rent plus posted Other Income; expenses use posting dates. Current month may be incomplete. Positive variance means period1 minus period2.',
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
 * Total salaries disbursed or specific employee salary details.
 */
export const getSalarySummary = async ({ month, year, employeeName = null, employeeId = null, startDate, endDate }, user) => {
  assertFinancialAccess(user);
  const period = resolveMonthDateRange(month, year);

  if (employeeName || employeeId) {
    let emp = null;
    if (employeeId) {
      emp = await Employee.findById(employeeId).lean();
    } else if (employeeName) {
      const escaped = employeeName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      emp = await Employee.findOne({ name: new RegExp('^' + escaped + '$', 'i') }).lean();
      if (!emp) {
        emp = await Employee.findOne({ name: new RegExp(escaped, 'i') }).lean();
      }
      if (!emp) {
        const firstToken = employeeName.trim().split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        emp = await Employee.findOne({ name: new RegExp('^' + firstToken, 'i') }).lean();
      }
    }

    if (!emp) {
      const activeStaff = await Employee.find({ employmentStatus: 'ACTIVE' }).select('name designation').limit(10).lean();
      return {
        error: `Employee '${employeeName || employeeId}' was not found in the employee directory.`,
        suggestion: 'Please verify the spelling or select from active staff.',
        availableEmployees: activeStaff.map(s => `${s.name} (${s.designation || 'Staff'})`),
      };
    }

    const payroll = await Payroll.findOne({ employeeId: emp._id, payrollMonth: period.periodString }).lean();
    const latestLoan = await StaffLoan.findOne({ employeeId: emp._id }).sort({ date: -1, createdAt: -1 }).lean();

    return {
      period: period.periodString,
      employeeName: emp.name,
      designation: emp.designation || 'Staff',
      department: emp.department || 'Office',
      employmentStatus: emp.employmentStatus || 'ACTIVE',
      basicSalary: round2(emp.basicSalary || 0),
      allowance: round2(emp.allowance || 0),
      grossSalary: round2(payroll?.grossSalary ?? ((emp.basicSalary || 0) + (emp.allowance || 0))),
      netPayable: round2(payroll?.netPayable ?? ((emp.basicSalary || 0) + (emp.allowance || 0))),
      payrollStatus: payroll ? (payroll.paymentStatus || payroll.status || 'UNPAID') : 'NO_PAYROLL_GENERATED',
      totalDeductions: round2(payroll?.totalDeduction || 0),
      currentLoanBalance: round2(latestLoan?.newBalance || 0),
      basis: `Profile salary and monthly payroll record for ${period.periodString}. Base salary is configured in employee profile.`,
    };
  }

  const report = await getHeadWiseExpenseReport(period.year, period.month, startDate ? { startDate: new Date(`${startDate}T00:00:00+05:00`), endDate: new Date(`${endDate}T23:59:59.999+05:00`) } : {});
  const salary = report.mainHeads.filter(h => h.mainHeadId === 'salary');
  const payrolls = await Payroll.find({ payrollMonth: period.periodString }).select('netPayable paymentStatus status').maxTimeMS(10000).lean();
  return {
    period: startDate ? `${startDate} to ${endDate} (Pakistan time)` : period.periodString,
    totalSalariesDisbursed: round2(salary.reduce((n, h) => n + h.totalSpent, 0)),
    totalPayrollCommitted: round2(payrolls.reduce((n, p) => n + (p.netPayable || 0), 0)),
    payrollCommitmentPeriod: period.periodString,
    paidEmployeesCount: payrolls.filter(p => p.paymentStatus === 'PAID' || p.status === 'PAID').length,
    employeesCount: payrolls.length,
    basis: 'Disbursements use expense posting date and existing Salary classification; payroll commitment uses payroll month. Staff loans are excluded.',
  };
};

/**
 * Tool 10: getEmployeeLoanSummary
 * Staff loan disbursements, repayments, and outstanding loan balances.
 */
export const getEmployeeLoanSummary = async ({ employeeName, employeeId }, user) => {
  assertFinancialAccess(user);
  let emp = null;
  if (employeeId) {
    emp = await Employee.findById(employeeId).lean();
  } else if (employeeName) {
    const escaped = employeeName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    emp = await Employee.findOne({ name: new RegExp('^' + escaped + '$', 'i') }).lean();
    if (!emp) {
      emp = await Employee.findOne({ name: new RegExp(escaped, 'i') }).lean();
    }
    if (!emp) {
      const firstToken = employeeName.trim().split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      emp = await Employee.findOne({ name: new RegExp('^' + firstToken, 'i') }).lean();
    }
  }

  if (!emp) {
    const activeStaff = await Employee.find({ employmentStatus: 'ACTIVE' }).select('name designation').limit(10).lean();
    return {
      error: `Employee '${employeeName || employeeId}' was not found.`,
      availableEmployees: activeStaff.map(s => `${s.name} (${s.designation || 'Staff'})`),
    };
  }

  const loans = await StaffLoan.find({ employeeId: emp._id }).sort({ date: -1, createdAt: -1 }).limit(10).lean();
  const currentLoanBalance = loans.length > 0 ? round2(loans[0].newBalance) : 0;
  const totalDisbursed = round2(loans.filter(l => l.type === 'DISBURSEMENT').reduce((sum, l) => sum + (l.amount || 0), 0));
  const totalRepaid = round2(loans.filter(l => l.type === 'REPAYMENT').reduce((sum, l) => sum + (l.amount || 0), 0));

  return {
    employeeName: emp.name,
    designation: emp.designation || 'Staff',
    currentLoanBalance,
    totalDisbursed,
    totalRepaid,
    recordsCount: loans.length,
    loanHistory: loans.map(l => ({
      date: l.date ? new Date(l.date).toISOString().slice(0, 10) : 'N/A',
      type: l.type === 'DISBURSEMENT' ? 'Advance/Disbursement (+)' : 'Repayment/Deduction (-)',
      amount: round2(l.amount),
      balanceAfter: round2(l.newBalance),
      payrollMonth: l.payrollMonth || 'Manual',
      description: l.description || '',
    })),
  };
};

/**
 * Tool 11: getEmployeeLedger
 *
 * Reuses the payroll controller's existing, audited employee-ledger reader.
 * The adapter only changes the transport shape and deliberately exposes no
 * mutation fields or internal database identifiers to the assistant.
 */
export const getEmployeeLedger = async ({ employeeName, employeeId }, user) => {
  assertFinancialAccess(user);

  let employee = null;
  if (employeeId) {
    employee = await Employee.findById(employeeId).lean();
  } else if (employeeName) {
    const escaped = employeeName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    employee = await Employee.findOne({ name: new RegExp(`^${escaped}$`, 'i') }).lean();
    if (!employee) employee = await Employee.findOne({ name: new RegExp(escaped, 'i') }).lean();
  }

  if (!employee) {
    const activeStaff = await Employee.find({ employmentStatus: 'ACTIVE' }).select('name designation').limit(10).lean();
    return {
      error: `Employee '${employeeName || employeeId}' was not found.`,
      availableEmployees: activeStaff.map(s => `${s.name} (${s.designation || 'Staff'})`),
    };
  }

  // This is the same production reader used by GET /staff/payroll/employee-ledger/:id.
  // Calling it through a small response adapter keeps the AI path on the exact
  // payroll accrual/installment/reversal rules instead of duplicating them.
  const { getEmployeeLedger: readEmployeeLedger } = await import('../../controllers/payrollController.js');
  let responseBody;
  let responseStatus = 200;
  const response = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(body) {
      responseBody = body;
      return body;
    },
  };
  await readEmployeeLedger({ params: { employeeId: String(employee._id) } }, response);

  if (responseStatus >= 400 || !responseBody?.success || !responseBody.data) {
    return { error: responseBody?.message || 'Employee ledger could not be read.' };
  }

  const data = responseBody.data;
  return {
    employee: {
      name: data.employee?.name || employee.name,
      designation: data.employee?.designation || employee.designation || 'Staff',
      department: data.employee?.department || employee.department || 'Office',
    },
    summary: {
      totalAccrued: round2(data.summary?.totalAccrued || 0),
      totalPaid: round2(data.summary?.totalPaid || 0),
      pendingBalance: round2(data.summary?.pendingBalance || 0),
      paymentDatesRequiringCorrection: data.summary?.paymentDatesRequiringCorrection || 0,
    },
    ledger: (Array.isArray(data.ledger) ? data.ledger : []).slice(0, 100).map(entry => ({
      date: entry.date ? new Date(entry.date).toISOString().slice(0, 10) : 'N/A',
      month: entry.month || entry.salaryForMonth || 'N/A',
      type: entry.type,
      voucherNo: entry.voucherNo || 'N/A',
      detail: entry.detail || '',
      accruedAmount: round2(entry.accruedAmount || 0),
      paidAmount: round2(entry.paidAmount || 0),
      runningPendingBalance: round2(entry.runningPendingBalance || 0),
      status: entry.status || 'N/A',
    })),
    basis: 'Production employee payroll ledger: monthly accruals, linked salary installments, legacy payment dates, and pending liability balance.',
  };
};

/**
 * Tool 12: getAccountLedger
 * Full running ledger statement of a specific bank or cash custodian account.
 */
export const getAccountLedger = async ({ accountName = null, accountId = null, month, year, limit = 20 }, user) => {
  assertFinancialAccess(user);
  const period = resolveMonthDateRange(month, year);
  let account = null;

  if (accountId) {
    account = await Account.findById(accountId).lean();
  } else if (accountName) {
    const escaped = accountName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    account = await Account.findOne({ name: new RegExp('^' + escaped + '$', 'i'), isActive: true }).lean();
    if (!account) {
      account = await Account.findOne({ name: new RegExp(escaped, 'i'), isActive: true }).lean();
    }
    if (!account) {
      const firstToken = accountName.trim().split(/\s+/)[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      account = await Account.findOne({ name: new RegExp('^' + firstToken, 'i'), isActive: true }).lean();
    }
  }

  if (!account) {
    const accounts = await Account.find({ isActive: true }).select('name type').limit(15).lean();
    return {
      error: `Account '${accountName || accountId}' was not found.`,
      availableAccounts: accounts.map(a => `${a.name} (${a.type})`),
    };
  }

  const ledger = await getAccountRunningLedger(account._id, period.startDate, period.endDate, { preserveEndInstant: true });
  const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 25);

  return {
    accountName: account.name,
    accountType: account.type,
    period: period.periodString,
    openingBalance: round2(ledger.previousBalance),
    closingBalance: round2(ledger.closingBalance),
    totalDebits: round2(ledger.totalDebits || 0),
    totalCredits: round2(ledger.totalCredits || 0),
    totalTransactions: ledger.entries.length,
    recentEntries: ledger.entries.slice(0, safeLimit).map(t => ({
      date: t.date ? new Date(new Date(t.date).getTime() + 18000000).toISOString().slice(0, 10) : 'N/A',
      voucherNo: t.voucherNo || 'N/A',
      head: t.category || 'General',
      description: t.detail || '',
      counterpartyAccount: t.counterpartyAccount || '',
      property: t.property || '',
      debit: round2(t.drAmount || 0),
      credit: round2(t.crAmount || 0),
      balance: round2(t.runningBalance || 0),
    })),
    basis: 'Production account running ledger; reversed and voided transactions are excluded by the shared ledger reader.',
  };
};

/**
 * Tool 13: getTenantRentSummary
 * Individual tenant lease details, rent history, and outstanding balance.
 */
export const getTenantRentSummary = async ({ tenantName = null, tenantId = null, propertyId = null, propertyName = null, month, year }, user) => {
  assertFinancialAccess(user);
  const period = resolveMonthDateRange(month, year);
  if (period.periodString < '2026-09') throw new AiError('Rental reports are available from September 2026.');

  let tenant = null;
  if(tenantId) tenant=await Tenant.findById(tenantId).maxTimeMS(10000).lean();
  else if (tenantName) {
    const escaped = tenantName.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    tenant = await Tenant.findOne({ fullName: new RegExp(escaped, 'i') }).lean();
  }

  const rentalSummary = await getRentalSummaryWithCarryForward(period.periodString, { rentOnly: true });
  let matchingUnits = [];

  for (const plaza of rentalSummary.plazas || []) {
    if(propertyId&&String(plaza.plazaId)!==String(propertyId)) continue;
    if (propertyName && !plaza.plazaName.toLowerCase().includes(propertyName.toLowerCase())) continue;
    for (const u of plaza.units || []) {
      const matchByName = tenant && u.tenantName && u.tenantName.toLowerCase()===tenant.fullName.toLowerCase();
      const matchByQuery = tenantName && u.tenantName && u.tenantName.toLowerCase().includes(tenantName.toLowerCase());
      if (matchByName || !tenantId&&matchByQuery || (!tenantName&&!tenantId&&(propertyName||propertyId))) {
        matchingUnits.push({
          plazaName: plaza.plazaName,
          unitName: u.unitName,
          tenantName: u.tenantName || 'N/A',
          agreedRent: round2(u.agreedRent || 0),
          receivedAmount: round2(u.receivedAmount || 0),
          outstandingBalance: round2(u.outstandingReceivable || 0),
          status: (Number(u.outstandingReceivable) || 0) <= 0 ? 'PAID' : 'PENDING_ARREARS',
        });
      }
    }
  }

  if (tenantName && !matchingUnits.length) {
    return {
      error: `Tenant '${tenantName}' was not found or has no active lease in ${period.periodString}.`,
      suggestion: 'Please verify the tenant full name or unit.',
    };
  }

  return {
    period: period.periodString,
    tenantName: tenant?.fullName || tenantName || 'All Tenants',
    totalAgreedRent: round2(matchingUnits.reduce((s, u) => s + u.agreedRent, 0)),
    totalReceivedAmount: round2(matchingUnits.reduce((s, u) => s + u.receivedAmount, 0)),
    totalOutstanding: round2(matchingUnits.reduce((s, u) => s + u.outstandingBalance, 0)),
    units: matchingUnits,
  };
};

/**
 * Master tools catalog metadata for LLM tool calling declarations
 */
export const FINANCIAL_TOOL_DECLARATIONS = [
  {
    name: 'getExpenseSummary',
    description: 'Get verified total expenses, category breakdown, and property expense classifications for a specific month, year, property, or expense category head.',
    parameters: {
      type: 'OBJECT',
      properties: {
        month: { type: 'INTEGER', description: 'Month number (1-12). Defaults to current month.' },
        year: { type: 'INTEGER', description: 'Four-digit year (e.g. 2026).' },
        propertyId: { type: 'STRING', description: 'Optional MongoDB ID of a specific property/plaza.' },
        propertyName: { type: 'STRING', description: 'Optional name of a property/plaza.' },
        categoryName: { type: 'STRING', description: 'Optional expense head or category name (e.g. Fuel, Utilities, Maintenance).' },
        startDate: { type: 'STRING', description: 'Optional YYYY-MM-DD within month.' },
        endDate: { type: 'STRING', description: 'Optional YYYY-MM-DD within month.' },
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
        propertyName: { type: 'STRING', description: 'Optional property name to filter by plaza.' },
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
        propertyName: { type: 'STRING', description: 'Optional property name.' },
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
        accountName: { type: 'STRING', description: 'Optional account name (e.g. Meezan Bank, Alfalah, Petty Cash).' },
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
        propertyId: { type: 'STRING', description: 'Optional property ID.' },
        propertyName: { type: 'STRING', description: 'Optional property name.' },
        accountName: { type: 'STRING', description: 'Optional account name.' },
        month: { type: 'INTEGER', description: 'Month 1-12; default current Pakistan month.' },
        year: { type: 'INTEGER', description: 'Four-digit year.' },
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
        propertyId: { type: 'STRING', description: 'Optional MongoDB ID of the property.' },
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
    description: 'Get salary disbursements and pending staff payroll for a given month, or detailed individual employee salary, loan balance, and cash records.',
    parameters: {
      type: 'OBJECT',
      properties: {
        month: { type: 'INTEGER', description: 'Month number (1-12).' },
        year: { type: 'INTEGER', description: 'Four-digit year (e.g. 2026).' },
        employeeName: { type: 'STRING', description: 'Optional employee name (e.g. Rizwan, Sabir, Khurshid).' },
        employeeId: { type: 'STRING', description: 'Optional employee MongoDB ID.' },
        startDate: { type: 'STRING', description: 'Optional YYYY-MM-DD within month.' },
        endDate: { type: 'STRING', description: 'Optional YYYY-MM-DD within month.' },
      },
    },
  },
  {
    name: 'getEmployeeLedger',
    description: 'Get the verified chronological payroll ledger for one employee, including salary accruals, linked payments, and pending balance. Use this for an employee ledger or salary statement.',
    parameters: {
      type: 'OBJECT',
      properties: {
        employeeName: { type: 'STRING', description: 'Employee full or partial name (e.g. Sabir Nawaz).' },
        employeeId: { type: 'STRING', description: 'Optional employee MongoDB ID.' },
      },
    },
  },
  {
    name: 'getEmployeeLoanSummary',
    description: 'Get verified staff advance/loan disbursements, repayments, and the current loan balance for one employee.',
    parameters: {
      type: 'OBJECT',
      properties: {
        employeeName: { type: 'STRING', description: 'Employee full or partial name.' },
        employeeId: { type: 'STRING', description: 'Optional employee MongoDB ID.' },
      },
    },
  },
  {
    name: 'getAccountLedger',
    description: 'Get the verified running ledger for one active bank, cash, or suspense account for a Pakistan calendar month.',
    parameters: {
      type: 'OBJECT',
      properties: {
        accountName: { type: 'STRING', description: 'Account name such as Meezan Bank or Petty Cash.' },
        accountId: { type: 'STRING', description: 'Optional account MongoDB ID.' },
        month: { type: 'INTEGER', description: 'Month number (1-12).' },
        year: { type: 'INTEGER', description: 'Four-digit year.' },
        limit: { type: 'INTEGER', description: 'Maximum ledger rows to display (1-25).' },
      },
    },
  },
  {
    name: 'getTenantRentSummary',
    description: 'Get verified lease rent received and outstanding balance for a named tenant or property.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tenantName: { type: 'STRING', description: 'Tenant full or partial name.' },
        propertyName: { type: 'STRING', description: 'Optional property/plaza name.' },
        month: { type: 'INTEGER', description: 'Month number (1-12).' },
        year: { type: 'INTEGER', description: 'Four-digit year.' },
      },
    },
  },
];

for(const declaration of FINANCIAL_TOOL_DECLARATIONS) Object.assign(declaration.parameters.properties,LEGACY_EXTENSION[declaration.name]??{});

export const ALL_FINANCIAL_TOOL_DECLARATIONS = [
  ...FINANCIAL_TOOL_DECLARATIONS,
  ...BUSINESS_TOOL_DECLARATIONS,
];

/**
 * Execute tool by name with parameter validation
 */
export const executeFinancialTool = async (name, args = {}, user) => {
  assertFinancialAccess(user);
  validateToolArguments(name, args);
  if(!FINANCIAL_TOOL_DECLARATIONS.some(tool => tool.name === name) && BUSINESS_HANDLERS[name]){
    const result=await BUSINESS_HANDLERS[name](args,user);
    if(result!==undefined){if(result.error&&result.matches){if(/Employee|Salary/.test(name))result.availableEmployees=result.matches.map(row=>row.name);if(/Property/.test(name))result.availableProperties=result.matches.map(row=>row.name);}return result;}
  }
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
    case 'getEmployeeLedger':
      return await getEmployeeLedger(args, user);
    case 'getEmployeeLoanSummary':
      return await getEmployeeLoanSummary(args, user);
    case 'getAccountLedger':
      return await getAccountLedger(args, user);
    case 'getTenantRentSummary':
      return await getTenantRentSummary(args, user);
    default:
      throw new Error(`Unknown financial tool: ${name}`);
  }
};

export function validateToolArguments(name, args) {
  const declaration = FINANCIAL_TOOL_DECLARATIONS.find(t => t.name === name);
  if (!declaration) {
    const businessDeclaration = BUSINESS_TOOL_DECLARATIONS.find(t => t.name === name);
    if (!businessDeclaration) throw new AiError('Unsupported read-only financial tool.');
    return validateBusinessArguments(businessDeclaration, args);
  }
  if (!declaration || !args || typeof args !== 'object' || Array.isArray(args)) {
    throw new AiError('Unsupported read-only financial tool.');
  }
  const allowed = new Set(Object.keys(declaration.parameters.properties));

  for (const [key, value] of Object.entries(args)) {
    if (!allowed.has(key)) throw new AiError('Unsupported financial filter.');
    if (/^(month|month1|month2|year|year1|year2|limit)$/.test(key) && !Number.isInteger(value)) {
      throw new AiError('Month, year and limit must be integers.');
    }
    if (/^(propertyId|employeeId|accountId)$/.test(key) && (typeof value !== 'string' || !/^[a-f0-9]{24}$/i.test(value))) {
      throw new AiError('Invalid property identifier.');
    }
    if (/^(propertyName|employeeName|accountName|categoryName|tenantName|unitName)$/.test(key)) {
      if (typeof value !== 'string' || !value.trim() || value.length > 100) {
        throw new AiError('Invalid entity filter name.');
      }
    }
    if (key === 'accountType' && !['BANK', 'CASH', 'SUSPENSE'].includes(value)) throw new AiError('Invalid account type.');
    if (key === 'transactionType' && !['EXPENSE', 'INCOME', 'TRANSFER'].includes(value)) throw new AiError('Invalid transaction type.');
    if (key === 'limit' && (value < 1 || value > 25)) throw new AiError('Transaction limit must be 1–25.');
  }

  if (name === 'getMonthlyComparison') {
    const { first, second } = comparisonPeriods(args);
    if (first.periodString < '2026-09' || second.periodString < '2026-09') throw new AiError('Rental comparison is available from September 2026.');
  } else if (name !== 'getAccountBalances' && name !== 'getEmployeeLoanSummary') {
    const period = resolveMonthDateRange(args.month, args.year);
    if (['getIncomeSummary', 'getRentCollectionSummary', 'getOutstandingRent', 'getPropertyFinancialSummary', 'getTenantRentSummary'].includes(name) && period.periodString < '2026-09') {
      throw new AiError('Rental reports are available from September 2026.');
    }
    if (Object.hasOwn(args, 'startDate') || Object.hasOwn(args, 'endDate')) {
      for (const d of [args.startDate, args.endDate]) {
        if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d || d.slice(0, 7) !== period.periodString) {
          throw new AiError('Choose valid dates within the selected month.');
        }
      }
      if (args.startDate > args.endDate) throw new AiError('Start date must precede end date.');
    }
  }
}
