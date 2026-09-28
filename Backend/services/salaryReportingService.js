export const getUtcMonthDateRange = (year, month) => ({
  startDate: new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0)),
  endDate: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)),
});

export const getUtcMonthKey = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const getSalaryPaymentPeriod = (salaryMonth, paymentDate) => {
  const paymentMonth = getUtcMonthKey(paymentDate);
  return {
    salaryForMonth: salaryMonth || null,
    paymentMonth,
    classification: paymentMonth && salaryMonth && paymentMonth < salaryMonth
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
