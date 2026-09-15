/**
 * Pakistan Financial Currency & Date Formatting Utilities (Backend)
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
 * @param {number|string} amount
 * @param {Object} options
 * @returns {string}
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
 * Standard Pakistan Business Date Formatter
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
  return `${day}-${monthShort}-${year}`;
};

/**
 * Formats full timestamp e.g. "14-Aug-2026 03:45 PM"
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
  hours = hours ? hours : 12;
  const hourStr = String(hours).padStart(2, '0');

  return `${dateStr} ${hourStr}:${minutes} ${ampm}`;
};

export default {
  formatPKR,
  formatDate,
  formatDateTime,
};
