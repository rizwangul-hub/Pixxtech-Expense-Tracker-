/**
 * Pakistan Financial Currency & Date Formatting Utilities
 * Standardized for Pixx Technologies Property Finance & Expense Management System.
 */

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const FULL_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Standard Pakistani Rupee Formatter
 * Format rules:
 * - Positive: "Rs. 1,500,000.00"
 * - Negative: "Rs. (50,000.00)" (accounting standard) or "-Rs. 50,000.00"
 * - Zero: "Rs. 0.00"
 * 
 * @param {number|string} amount - Numeric or string monetary value
 * @param {Object} options
 * @param {boolean} [options.showDecimals=true] - Display 2 decimal places
 * @param {boolean} [options.useParentheses=true] - Use accounting parentheses for negative values
 * @param {string} [options.prefix='Rs. '] - Currency symbol/prefix
 * @returns {string} Formatted currency string
 */
export const formatPKR = (amount, { showDecimals = true, useParentheses = true, prefix = 'Rs. ' } = {}) => {
  if (amount === null || amount === undefined || isNaN(Number(amount))) {
    return `${prefix}0${showDecimals ? '.00' : ''}`;
  }

  const num = Number(amount);
  const isNegative = num < 0;
  const absNum = Math.abs(num);

  const formattedAbs = absNum.toLocaleString('en-US', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  });

  if (isNegative) {
    return useParentheses
      ? `${prefix}(${formattedAbs})`
      : `-${prefix}${formattedAbs}`;
  }

  return `${prefix}${formattedAbs}`;
};

/**
 * Compact Pakistani Rupee Formatter (for summary stat cards & badges)
 * Example: 1,500,000 -> "Rs. 1.50M", 75,000 -> "Rs. 75.00K"
 * @param {number|string} amount
 * @returns {string}
 */
export const formatPKRShort = (amount) => {
  const num = Number(amount) || 0;
  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absNum >= 1_000_000_000) {
    return `${sign}Rs. ${(absNum / 1_000_000_000).toFixed(2)}B`;
  }
  if (absNum >= 1_000_000) {
    return `${sign}Rs. ${(absNum / 1_000_000).toFixed(2)}M`;
  }
  if (absNum >= 1_000) {
    return `${sign}Rs. ${(absNum / 1_000).toFixed(2)}K`;
  }
  return formatPKR(num, { showDecimals: false });
};

/**
 * Parse a raw input string or number into a clean, safe numeric float
 * Strips 'Rs.', commas, and whitespace.
 * @param {string|number} val
 * @returns {number}
 */
export const parseFinancialNumber = (val) => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (!val || typeof val !== 'string') return 0;
  const clean = val.replace(/[^0-9.-]+/g, '');
  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Standard Pakistan Business Date Formatter
 * Supported formats:
 * - 'DD-MMM-YYYY': "14-Aug-2026" (Default recommended)
 * - 'DD/MM/YYYY': "14/08/2026"
 * - 'MMMM YYYY': "August 2026"
 * 
 * @param {Date|string|number} dateVal
 * @param {'DD-MMM-YYYY'|'DD/MM/YYYY'|'MMMM YYYY'} [style='DD-MMM-YYYY']
 * @returns {string}
 */
export const formatDate = (dateVal, style = 'DD-MMM-YYYY') => {
  if (!dateVal) return '—';
  let d;
  if (typeof dateVal === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateVal.trim())) {
    const [y, m, dayNum] = dateVal.trim().split('-').map(Number);
    d = new Date(y, m - 1, dayNum);
  } else {
    d = new Date(dateVal);
  }
  if (isNaN(d.getTime())) return '—';

  const day = String(d.getDate()).padStart(2, '0');
  const monthIdx = d.getMonth();
  const monthShort = MONTH_NAMES[monthIdx];
  const monthFull = FULL_MONTH_NAMES[monthIdx];
  const monthNum = String(monthIdx + 1).padStart(2, '0');
  const year = d.getFullYear();

  if (style === 'DD/MM/YYYY') {
    return `${day}/${monthNum}/${year}`;
  }
  if (style === 'MMMM YYYY') {
    return `${monthFull} ${year}`;
  }
  // Default: DD-MMM-YYYY
  return `${day}-${monthShort}-${year}`;
};

/**
 * Standard Pakistan Timestamp Formatter
 * Example: "14-Aug-2026 03:45 PM"
 * @param {Date|string|number} dateVal
 * @returns {string}
 */
export const formatDateTime = (dateVal) => {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  if (isNaN(d.getTime())) return '—';

  const dateStr = formatDate(d, 'DD-MMM-YYYY');
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // 0 hour becomes 12
  const hourStr = String(hours).padStart(2, '0');

  return `${dateStr} ${hourStr}:${minutes} ${ampm}`;
};

/**
 * Resolve Actual Debit (Dr.) and Credit (Cr.) display names for a transaction or entry
 */
export const resolveTransactionAccounts = (tx) => {
  if (!tx) return { dr: '—', cr: '—', head: 'Uncategorized' };

  const isRent =
    tx.reportCategory === 'Rent' ||
    tx.sourceModule === 'RENT_RECEIVED' ||
    tx.entryType === 'RENT' ||
    tx.voucherType === 'RENT_RECEIPT';

  const isTransfer =
    tx.entryType === 'TRANSFER' ||
    tx.transactionType === 'TRANSFER' ||
    tx.voucherType === 'TRANSFER';
  const isOtherIncome =
    tx.reportCategory === 'Other Income' ||
    tx.sourceModule === 'OTHER_INCOME' ||
    tx.voucherType === 'OTHER_INCOME' ||
    (tx.transactionType === 'INCOME' && !isRent);

  let propName =
    tx.propertyId?.plazaName ||
    tx.propertyId?.propertyName ||
    tx.propertyName ||
    tx.entryData?.property?.plazaName ||
    '';

  let unitLabel = '';
  if (tx.unitId?.unitName) {
    unitLabel = tx.unitId.unitName;
  } else if (tx.unitName) {
    unitLabel = tx.unitName;
  } else if (tx.propertyId?.units && tx.unitId) {
    const unitId = tx.unitId?._id || tx.unitId;
    const u = tx.propertyId.units.find(
      (unit) => (unit._id || unit).toString() === unitId.toString()
    );
    if (u) unitLabel = u.unitName || u.unitNumber || '';
  }

  const locationName = [propName, unitLabel].filter(Boolean).join(' - ');

  const headName =
    tx.categoryId?.name ||
    tx.categoryName ||
    tx.entryData?.category?.name ||
    (isRent ? 'Rental Income' : isTransfer ? 'Internal Transfer' : 'General Expense');

  let drRaw =
    tx.drAccountId?.name ||
    tx.receivingAccountId?.name ||
    tx.drAccount?.name ||
    tx.entryData?.drAccount?.name ||
    '';

  let crRaw =
    tx.crAccountId?.name ||
    tx.crAccount?.name ||
    tx.entryData?.crAccount?.name ||
    '';

  let dr = drRaw;
  let cr = crRaw;

  if (isRent) {
    dr = drRaw || tx.receivingAccountId?.name || 'Receiving Account (Bank/Cash)';
    cr = locationName || headName;
  } else if (isOtherIncome) {
    dr = drRaw || tx.receivingAccountId?.name || 'Receiving Account (Bank/Cash)';
    cr = headName;
  } else if (isTransfer) {
    dr = !drRaw || /Clearing|External Parties/i.test(drRaw) ? 'Destination Account' : drRaw;
    cr = !crRaw || /Clearing|External Parties/i.test(crRaw) ? 'Source Account' : crRaw;
  } else {
    // EXPENSE
    if (!drRaw || /Clearing|External Parties/i.test(drRaw)) {
      dr = locationName ? `${locationName} (${headName})` : headName;
    }
    if (!crRaw || /Clearing|External Parties/i.test(crRaw)) {
      cr = 'Payment Account (Bank/Cash)';
    }
  }

  return {
    dr: dr || '—',
    cr: cr || '—',
    head: headName,
    location: locationName,
  };
};

export default {
  formatPKR,
  formatPKRShort,
  parseFinancialNumber,
  formatDate,
  formatDateTime,
  resolveTransactionAccounts,
};
