/** Pakistan Standard Time — monthly financial reports use the business calendar (UTC+5). */
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Inclusive UTC instants for one YYYY-MM period in Pakistan (rent, expenses, salaries).
 */
export const getUtcMonthDateRange = (year, month) => {
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0) - PKT_OFFSET_MS);
  const endDate = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0) - PKT_OFFSET_MS - 1);
  return { startDate, endDate };
};

/** YYYY-MM bucket for a payment/posting instant in Pakistan local calendar. */
export const getUtcMonthKey = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const pktWallClock = new Date(date.getTime() + PKT_OFFSET_MS);
  return `${pktWallClock.getUTCFullYear()}-${String(pktWallClock.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Parse date-only strings from forms (YYYY-MM-DD) without UTC midnight shifting the month.
 */
export const normalizeBusinessPaymentDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (!value) return new Date();
  const str = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 7, 0, 0, 0));
  }
  const parsed = new Date(str);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

/** Ledger date when Khurshid Anwar verifies a salary payout (cash leaves the bank). */
export const resolveSalaryPaymentDateOnVerification = (_entry) => new Date();

export const getSalaryPaymentPeriod = (salaryMonth, paymentDate) => {
  const paymentMonth = getUtcMonthKey(paymentDate);
  return {
    salaryForMonth: salaryMonth || null,
    paymentMonth,
    financialReportMonth: paymentMonth,
    classification: paymentMonth && salaryMonth && paymentMonth <= salaryMonth
      ? 'ADVANCE_SALARY'
      : 'SALARY',
    requiresPaymentDateCorrection: !paymentMonth,
  };
};

export const formatSalaryMonth = (month) => {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month || ''))) return month || '';
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  }) + ` ${year}`;
};

export const getSalaryPaymentDetail = ({ employeeName, designation, salaryMonth, paymentDate, notes = '' }) => {
  const period = getSalaryPaymentPeriod(salaryMonth, paymentDate);
  const prefix = period.classification === 'ADVANCE_SALARY' ? 'ADVANCE SALARY' : 'Salary';
  const designationLabel = designation ? ` (${designation})` : '';
  const paymentMonthLabel = period.paymentMonth ? ` (paid ${period.paymentMonth})` : '';
  const notesLabel = notes ? `. ${notes}` : '';
  return `${prefix} - ${employeeName}${designationLabel} - ${formatSalaryMonth(salaryMonth)} Salary${paymentMonthLabel}${notesLabel}`;
};

export const groupSalaryPaymentsByAccount = (transactions, fallbackPayment = null) => {
  const groupedPayments = new Map();
  for (const tx of transactions || []) {
    if (!tx.crAccountId) continue;
    const accountId = tx.crAccountId.toString();
    const payment = groupedPayments.get(accountId) || {
      amount: 0,
      accountId: tx.crAccountId,
      debitAccountId: tx.drAccountId || null,
      categoryId: tx.categoryId || null,
      paymentMethod: tx.paymentMethod || 'BANK_TRANSFER',
    };
    payment.amount = Math.round((payment.amount + Number(tx.amount || 0)) * 100) / 100;
    groupedPayments.set(accountId, payment);
  }

  if (groupedPayments.size === 0 && fallbackPayment?.accountId && Number(fallbackPayment.amount) > 0) {
    groupedPayments.set(fallbackPayment.accountId.toString(), {
      amount: Math.round(Number(fallbackPayment.amount) * 100) / 100,
      accountId: fallbackPayment.accountId,
      debitAccountId: fallbackPayment.debitAccountId || null,
      categoryId: fallbackPayment.categoryId || null,
      paymentMethod: fallbackPayment.paymentMethod || 'BANK_TRANSFER',
    });
  }

  return groupedPayments;
};
